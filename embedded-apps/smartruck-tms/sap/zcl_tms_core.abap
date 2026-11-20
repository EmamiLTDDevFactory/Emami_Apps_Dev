"! Business logic of SmarTruck TMS on SAP (no UI, no COMMIT): transporter and customer masters, PO/SO check, freight vendor invoice
"! (FI document through BAPI_ACC_DOCUMENT_*, idempotent by external reference) and payment status. Called by ZCL_ZTMS_DPC (OData ZTMS_SRV).
"! Posting parameters come from TVARVC (type P): ZTMS_BUKRS (default 1000), ZTMS_FREIGHT_GL (mandatory for posting), ZTMS_TAXCODE
"! (optional), ZTMS_BLART (default KR). Without ZTMS_FREIGHT_GL the invoice is only CHECKED, never posted - finance must set the account.
CLASS zcl_tms_core DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS c_transporter_group TYPE ktokk VALUE 'ZTRP'.
    CLASS-METHODS get_param
      IMPORTING iv_name TYPE rvari_vnam iv_default TYPE string OPTIONAL
      RETURNING VALUE(rv_value) TYPE string.
    CLASS-METHODS get_vendors
      IMPORTING iv_lifnr TYPE lifnr OPTIONAL iv_max TYPE i DEFAULT 5000
      RETURNING VALUE(rt_vendor) TYPE zcl_tms_ty=>tt_vendor.
    CLASS-METHODS get_customers
      IMPORTING iv_kunnr TYPE kunnr OPTIONAL iv_max TYPE i DEFAULT 5000
      RETURNING VALUE(rt_customer) TYPE zcl_tms_ty=>tt_customer.
    CLASS-METHODS check_poso
      IMPORTING iv_po TYPE string iv_so TYPE string
      RETURNING VALUE(rs_check) TYPE zcl_tms_ty=>ts_posocheck.
    "! Validates the invoice; with iv_simulate only the BAPI check runs. Never commits: the caller commits or rolls back.
    "! Raises nothing: an error comes back in rs_out-message with belnrfi empty.
    CLASS-METHODS post_freight_invoice
      IMPORTING is_in TYPE zcl_tms_ty=>ts_freightinvoice iv_user TYPE string OPTIONAL
      RETURNING VALUE(rs_out) TYPE zcl_tms_ty=>ts_freightinvoice.
    CLASS-METHODS payment_status
      IMPORTING iv_belnr TYPE belnr_d
      RETURNING VALUE(rs_status) TYPE zcl_tms_ty=>ts_paymentstatus.
  PRIVATE SECTION.
    CLASS-METHODS fail
      IMPORTING is_in TYPE zcl_tms_ty=>ts_freightinvoice iv_text TYPE string
      RETURNING VALUE(rs_out) TYPE zcl_tms_ty=>ts_freightinvoice.
ENDCLASS.

CLASS zcl_tms_core IMPLEMENTATION.

  METHOD get_param.
    DATA lv_low TYPE tvarvc-low.
    SELECT SINGLE low FROM tvarvc INTO @lv_low WHERE name = @iv_name AND type = 'P'.
    IF sy-subrc = 0 AND lv_low IS NOT INITIAL.
      rv_value = lv_low.
    ELSE.
      rv_value = iv_default.
    ENDIF.
  ENDMETHOD.

  METHOD get_vendors.
    DATA(lv_bukrs) = CONV bukrs( get_param( iv_name = 'ZTMS_BUKRS' iv_default = '1000' ) ).
    SELECT l~lifnr, l~name1, l~ort01, l~stcd3, b~zterm, l~sperr AS sperr_c, b~sperr AS sperr_b, l~loevm AS loevm_c, b~loevm AS loevm_b
      FROM lfa1 AS l INNER JOIN lfb1 AS b ON b~lifnr = l~lifnr
      WHERE b~bukrs = @lv_bukrs AND l~ktokk = @c_transporter_group
        AND ( @iv_lifnr = '' OR l~lifnr = @iv_lifnr )
      ORDER BY l~lifnr
      INTO TABLE @DATA(lt_raw) UP TO @iv_max ROWS.
    LOOP AT lt_raw INTO DATA(ls).
      APPEND VALUE #( lifnr = ls-lifnr name1 = ls-name1 ort01 = ls-ort01 stcd3 = ls-stcd3 zterm = ls-zterm transporter = 'X'
                      sperr = COND #( WHEN ls-sperr_c IS NOT INITIAL OR ls-sperr_b IS NOT INITIAL THEN 'X' ELSE '' )
                      loevm = COND #( WHEN ls-loevm_c IS NOT INITIAL OR ls-loevm_b IS NOT INITIAL THEN 'X' ELSE '' ) ) TO rt_vendor.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_customers.
    SELECT k~kunnr, k~name1, k~ort01, k~regio, t~bezei
      FROM kna1 AS k LEFT OUTER JOIN t005u AS t ON t~spras = 'E' AND t~land1 = k~land1 AND t~bland = k~regio
      WHERE k~loevm = '' AND ( @iv_kunnr = '' OR k~kunnr = @iv_kunnr )
      ORDER BY k~kunnr
      INTO TABLE @DATA(lt_raw) UP TO @iv_max ROWS.
    LOOP AT lt_raw INTO DATA(ls).
      APPEND VALUE #( kunnr = ls-kunnr name1 = ls-name1 ort01 = ls-ort01 regio = ls-regio zone = ls-bezei ) TO rt_customer.
    ENDLOOP.
  ENDMETHOD.

  METHOD check_poso.
    DATA: lv_ebeln TYPE ekko-ebeln, lv_loekz TYPE ekko-loekz, lv_vbeln TYPE vbak-vbeln.
    rs_check = VALUE #( po = iv_po so = iv_so valid = 'X' ).
    IF iv_po IS NOT INITIAL.
      lv_ebeln = |{ iv_po ALPHA = IN }|.
      SELECT SINGLE loekz FROM ekko INTO @lv_loekz WHERE ebeln = @lv_ebeln.
      IF sy-subrc <> 0.
        rs_check-valid = ''.
        rs_check-message = |Purchase order { iv_po } does not exist.|.
        RETURN.
      ELSEIF lv_loekz IS NOT INITIAL.
        rs_check-valid = ''.
        rs_check-message = |Purchase order { iv_po } is deleted.|.
        RETURN.
      ENDIF.
    ENDIF.
    IF iv_so IS NOT INITIAL.
      lv_vbeln = |{ iv_so ALPHA = IN }|.
      SELECT SINGLE vbeln FROM vbak INTO @lv_vbeln WHERE vbeln = @lv_vbeln.
      IF sy-subrc <> 0.
        rs_check-valid = ''.
        rs_check-message = |Sales order { iv_so } does not exist.|.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD fail.
    rs_out = is_in.
    CLEAR: rs_out-belnrfi, rs_out-gjahr.
    rs_out-message = iv_text.
  ENDMETHOD.

  METHOD post_freight_invoice.
    DATA: ls_header  TYPE bapiache09,
          lt_ap      TYPE STANDARD TABLE OF bapiacap09,
          lt_gl      TYPE STANDARD TABLE OF bapiacgl09,
          lt_tax     TYPE STANDARD TABLE OF bapiactx09,
          lt_amt     TYPE STANDARD TABLE OF bapiaccr09,
          lt_ret     TYPE STANDARD TABLE OF bapiret2,
          lv_key     TYPE bapiache09-obj_key,
          lv_belnr   TYPE bkpf-belnr,
          lv_gjahr   TYPE bkpf-gjahr.
    DATA(lv_bukrs) = CONV bukrs( get_param( iv_name = 'ZTMS_BUKRS' iv_default = '1000' ) ).
    DATA(lv_gl)    = get_param( iv_name = 'ZTMS_FREIGHT_GL' ).
    DATA(lv_tax)   = get_param( iv_name = 'ZTMS_TAXCODE' ).
    DATA(lv_blart) = CONV blart( get_param( iv_name = 'ZTMS_BLART' iv_default = 'KR' ) ).
    rs_out = is_in.
    rs_out-bukrs = lv_bukrs.
    CLEAR: rs_out-belnrfi, rs_out-gjahr, rs_out-message.

    IF is_in-extref IS INITIAL.
      rs_out = fail( is_in = is_in iv_text = `ExtRef is mandatory (idempotency key).` ).
      RETURN.
    ENDIF.
    IF is_in-amount <= 0.
      rs_out = fail( is_in = is_in iv_text = `Amount must be greater than zero.` ).
      RETURN.
    ENDIF.
    IF is_in-waers IS NOT INITIAL AND is_in-waers <> 'INR'.
      rs_out = fail( is_in = is_in iv_text = `Only INR freight invoices are supported.` ).
      RETURN.
    ENDIF.

    " idempotency: the same ExtRef returns the TMS document that already exists (BKPF-XBLNR + header text 'TMS...', so an unrelated
    " document that happens to use the same reference is never returned), also for a check-only call
    SELECT SINGLE belnr, gjahr FROM bkpf INTO (@lv_belnr, @lv_gjahr)
      WHERE bukrs = @lv_bukrs AND xblnr = @is_in-extref AND bktxt LIKE 'TMS%' AND stblg = ''.
    IF sy-subrc = 0.
      rs_out-belnrfi = lv_belnr.
      rs_out-gjahr = lv_gjahr.
      rs_out-message = |Already posted as { lv_belnr }/{ lv_gjahr }.|.
      RETURN.
    ENDIF.

    DATA(lv_lifnr) = CONV lifnr( |{ is_in-lifnr ALPHA = IN }| ).
    DATA(lt_v) = get_vendors( iv_lifnr = lv_lifnr iv_max = 1 ).
    IF lt_v IS INITIAL.
      rs_out = fail( is_in = is_in iv_text = |Vendor { is_in-lifnr } is not a transporter of company code { lv_bukrs }.| ).
      RETURN.
    ENDIF.
    IF lt_v[ 1 ]-sperr IS NOT INITIAL OR lt_v[ 1 ]-loevm IS NOT INITIAL.
      rs_out = fail( is_in = is_in iv_text = |Vendor { is_in-lifnr } is blocked.| ).
      RETURN.
    ENDIF.
    IF lv_gl IS INITIAL.
      rs_out-message = `Validated (vendor, amount, duplicate). NOT posted: TVARVC ZTMS_FREIGHT_GL is not set - finance must define the freight expense account.`.
      RETURN.
    ENDIF.
    DATA(lv_date) = COND d( WHEN is_in-invdate IS INITIAL THEN sy-datum ELSE is_in-invdate ).

    ls_header = VALUE #( bus_act = 'RFBU' username = sy-uname comp_code = lv_bukrs doc_date = lv_date pstng_date = lv_date
                         doc_type = lv_blart ref_doc_no = is_in-extref header_txt = |TMS { is_in-sin }| ).
    APPEND VALUE #( itemno_acc = '0000000001' vendor_no = lv_lifnr comp_code = lv_bukrs pmnttrms = lt_v[ 1 ]-zterm bline_date = lv_date
                    item_text = |TMS { is_in-sin } { iv_user }| ) TO lt_ap.
    APPEND VALUE #( itemno_acc = '0000000002' gl_account = |{ lv_gl ALPHA = IN }| comp_code = lv_bukrs plant = is_in-werks
                    item_text = |TMS freight { is_in-sin }| tax_code = lv_tax ) TO lt_gl.
    APPEND VALUE #( itemno_acc = '0000000001' currency = 'INR' amt_doccur = is_in-amount * -1 ) TO lt_amt.
    APPEND VALUE #( itemno_acc = '0000000002' currency = 'INR' amt_doccur = is_in-amount ) TO lt_amt.

    CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
      EXPORTING documentheader = ls_header
      TABLES accountgl = lt_gl accountpayable = lt_ap currencyamount = lt_amt return = lt_ret.
    DATA lv_errs TYPE string.
    LOOP AT lt_ret INTO DATA(ls_ret) WHERE type CA 'EA'.
      lv_errs = COND #( WHEN lv_errs IS INITIAL THEN |{ ls_ret-message }| ELSE |{ lv_errs }; { ls_ret-message }| ).
    ENDLOOP.
    IF lv_errs IS NOT INITIAL.
      rs_out = fail( is_in = is_in iv_text = lv_errs ).
      RETURN.
    ENDIF.
    IF is_in-simulated IS NOT INITIAL.
      rs_out-message = `Check passed (simulation, nothing posted).`.
      RETURN.
    ENDIF.

    CLEAR lt_ret.
    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING documentheader = ls_header
      IMPORTING obj_key = lv_key
      TABLES accountgl = lt_gl accountpayable = lt_ap currencyamount = lt_amt return = lt_ret.
    CLEAR lv_errs.
    LOOP AT lt_ret INTO ls_ret WHERE type CA 'EA'.
      lv_errs = COND #( WHEN lv_errs IS INITIAL THEN |{ ls_ret-message }| ELSE |{ lv_errs }; { ls_ret-message }| ).
    ENDLOOP.
    IF lv_errs IS NOT INITIAL.
      rs_out = fail( is_in = is_in iv_text = lv_errs ).
      RETURN.
    ENDIF.
    IF lv_key IS NOT INITIAL.
      " obj_key = BELNR(10) BUKRS(4) GJAHR(4)
      rs_out-belnrfi = lv_key(10).
      rs_out-gjahr = lv_key+14(4).
      rs_out-message = |Posted { rs_out-belnrfi }/{ rs_out-gjahr }.|.
    ELSE.
      rs_out = fail( is_in = is_in iv_text = `Posting returned no document key.` ).
    ENDIF.
  ENDMETHOD.

  METHOD payment_status.
    DATA(lv_bukrs) = CONV bukrs( get_param( iv_name = 'ZTMS_BUKRS' iv_default = '1000' ) ).
    rs_status-belnr = iv_belnr.
    SELECT SINGLE augbl, augdt, gjahr FROM bsak INTO (@rs_status-augbl, @rs_status-augdt, @rs_status-gjahr)
      WHERE bukrs = @lv_bukrs AND belnr = @iv_belnr.
    IF sy-subrc = 0.
      rs_status-cleared = 'X'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
