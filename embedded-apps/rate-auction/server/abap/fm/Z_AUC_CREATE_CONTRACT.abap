*&---------------------------------------------------------------------*
*& Function module Z_AUC_CREATE_CONTRACT
*& Attributes: Remote-Enabled Module
*& Import:  IS_DATA TYPE ZAUC_S_CONTRACT
*& Export:  EV_EBELN TYPE EBELN
*& Tables:  ET_RETURN LIKE BAPIRET2
*& STATUS: checks complete. The BAPI call is written as comments because the structure and field names must be
*& verified in SE37/SE11 on your release first. Uncomment and fix after verifying.
*&---------------------------------------------------------------------*
  DATA: lv_ok TYPE c.
* DATA: ls_header  TYPE bapimeoutheader,
*       ls_headerx TYPE bapimeoutheaderx,
*       lt_item    TYPE STANDARD TABLE OF bapimeoutitem,
*       ls_item    TYPE bapimeoutitem,
*       lt_itemx   TYPE STANDARD TABLE OF bapimeoutitemx,
*       lt_ret     TYPE STANDARD TABLE OF bapiret2,
*       ls_ret     TYPE bapiret2,
*       lv_ebeln   TYPE ebeln,
*       lv_error   TYPE c.

  CLEAR ev_ebeln.
  REFRESH et_return.

  PERFORM check_master TABLES et_return
    USING is_data-lifnr is_data-matnr is_data-ekorg is_data-werks
    CHANGING lv_ok.
  IF lv_ok IS INITIAL.
    RETURN.
  ENDIF.

  " --- core call (VERIFY every structure and field name against BAPI_CONTRACT_CREATE on your release) ---
*  ls_header-doc_type   = is_data-ctype.        " WK quantity contract, MK value contract
*  ls_header-vendor     = is_data-lifnr.
*  ls_header-purch_org  = is_data-ekorg.
*  ls_header-pur_group  = is_data-ekgrp.
*  ls_header-currency   = is_data-waers.
*  ls_header-vper_start = is_data-kdatb.
*  ls_header-vper_end   = is_data-kdate.
*  ls_header-pmnttrms   = is_data-zterm.
*  ls_header-incoterms1 = is_data-inco1.
*  " set the matching X-flags in LS_HEADERX for every field filled above
*
*  ls_item-item_no      = '00010'.
*  ls_item-material     = is_data-matnr.
*  ls_item-plant        = is_data-werks.
*  ls_item-short_text   = is_data-txz01.
*  ls_item-po_unit      = is_data-meins.        " convert the external unit with CONVERSION_EXIT_CUNIT_INPUT first
*  ls_item-target_qty   = is_data-ktmng.        " quantity contract
*  ls_item-net_price    = is_data-netpr.
*  ls_item-price_unit   = is_data-peinh.
*  ls_item-tax_code     = is_data-mwskz.
*  APPEND ls_item TO lt_item.
*  " set the matching X-flags in LT_ITEMX
*
*  CALL FUNCTION 'BAPI_CONTRACT_CREATE'
*    EXPORTING header = ls_header headerx = ls_headerx
*    IMPORTING purchasingdocument = lv_ebeln
*    TABLES    return = lt_ret item = lt_item itemx = lt_itemx.
*
*  LOOP AT lt_ret INTO ls_ret.
*    APPEND ls_ret TO et_return.
*    IF ls_ret-type CA 'EA'.
*      lv_error = 'X'.
*    ENDIF.
*  ENDLOOP.
*  IF lv_error = 'X'.
*    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
*  ELSEIF lv_ebeln IS NOT INITIAL.
*    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
*    ev_ebeln = lv_ebeln.
*  ENDIF.

  IF ev_ebeln IS INITIAL.
    PERFORM add_msg TABLES et_return USING 'E' 'Contract creation is not completed yet (see TODO)'.
  ENDIF.
