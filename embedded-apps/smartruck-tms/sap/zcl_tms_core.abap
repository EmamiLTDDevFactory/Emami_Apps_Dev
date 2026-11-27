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
    "! Outbound deliveries (read only): cartons (via MARM carton unit ZTMS_CARTON_UOM, default KAR), gross weight in kg, volume in m3, goods issue,
    "! and e-invoice / e-way bill status of the billing document that followed the delivery. The e-invoice / e-way tables are read dynamically
    "! (TVARVC ZTMS_EINV_TABLE / ZTMS_EWB_TABLE) and fail soft: unreadable means the fields stay empty.
    CLASS-METHODS get_out_deliveries
      IMPORTING it_vbeln TYPE string_table
      RETURNING VALUE(rt_delivery) TYPE zcl_tms_ty=>tt_outdelivery.
    "! One ECC shipment: header, linked deliveries (VTTP) and the shipment cost documents (VFKP, cancelled ones excluded). Initial = not found.
    CLASS-METHODS get_out_shipment
      IMPORTING iv_tknum TYPE tknum
      RETURNING VALUE(rs_shipment) TYPE zcl_tms_ty=>ts_outshipment.
    CLASS-METHODS payment_status
      IMPORTING iv_belnr TYPE belnr_d
      RETURNING VALUE(rs_status) TYPE zcl_tms_ty=>ts_paymentstatus.
    "! Lane freight: ZB00 condition records valid on iv_date (CDS ZI_TMS_LANERATE over A964/A973/A972) with route text, distance (km),
    "! transit hours (TVRO-TRAZTD is HHHHMMSS), first/last stage points (TVRAB), vehicle type, shipping type and transporter texts.
    "! Priority 1 = cheapest transporter for the same shipment type + route + vehicle type + rate basis + shipping type + special processing.
    "! Empty filter tables = no restriction.
    "! Billing documents for a trip vehicle (ZSMART_VEH replacement), by billing number and/or by outbound delivery (VBFA -> M).
    "! Figures as ZSMART_VEH: cases = billed qty in KAR (0 for inside-pack trade-scheme items), value = NETWR + MWSBP, weights in kg; with
    "! iv_werks only that plant's items count. TtSin/TtVehicle = Trip Trail vehicle holding it, InstaSin/InstaVehicle = Instavans one (read only).
    CLASS-METHODS get_trip_invoices
      IMPORTING it_vbeln TYPE string_table OPTIONAL it_vbelv TYPE string_table OPTIONAL iv_werks TYPE werks_d OPTIONAL
      RETURNING VALUE(rt_inv) TYPE zcl_tms_ty=>tt_tripinvoice.
    "! Write the trip vehicle and its COMPLETE invoice list (idempotent; removed ones get LOEKZ = 'X') into ZTMS_TRIP_VEH / ZTMS_TRIP_INV.
    "! ZINSTA_VEHICLE_H/I are written too only when TVARVC ZTMS_INSTA_WRITE = 'X' (cutover; OFF while Instavans runs in parallel).
    "! No COMMIT: the caller commits when rs_out-ok = 'X', otherwise rolls back. Raises nothing: errors come back in rs_out-message.
    CLASS-METHODS write_trip_vehicle
      IMPORTING is_in TYPE zcl_tms_ty=>ts_tripvehicle iv_user TYPE string OPTIONAL iv_insta TYPE abap_bool OPTIONAL
      RETURNING VALUE(rs_out) TYPE zcl_tms_ty=>ts_tripvehicle.
    "! Parallel run: billing documents on a Trip Trail or Instavans vehicle created in the last iv_days days, side by side.
    CLASS-METHODS parallel_check
      IMPORTING iv_werks TYPE werks_d OPTIONAL iv_days TYPE i DEFAULT 30
      RETURNING VALUE(rt_chk) TYPE zcl_tms_ty=>tt_parallelcheck.
    "! Freight condition A964 rows with transporter name / region / default e-mail and route text (CDS ZI_TMS_A964_VENDOR). Empty filter
    "! tables = no restriction; the caller must restrict or page (iv_top). Newest validity first within a route and transporter.
    CLASS-METHODS get_freight_cond
      IMPORTING it_route TYPE string_table OPTIONAL it_tdlnr TYPE string_table OPTIONAL it_kschl TYPE string_table OPTIONAL
                it_vsart TYPE string_table OPTIONAL it_shtyp TYPE string_table OPTIONAL it_add01 TYPE string_table OPTIONAL
                iv_skip TYPE i DEFAULT 0 iv_top TYPE i DEFAULT 5000
      RETURNING VALUE(rt_cond) TYPE zcl_tms_ty=>tt_freightcond.
    CLASS-METHODS get_lanes
      IMPORTING it_route   TYPE string_table OPTIONAL
                it_lifnr   TYPE string_table OPTIONAL
                it_vsart   TYPE string_table OPTIONAL
                it_vehicle TYPE string_table OPTIONAL
                iv_date    TYPE d DEFAULT sy-datum
      RETURNING VALUE(rt_lane) TYPE zcl_tms_ty=>tt_lane.
  PRIVATE SECTION.
    CLASS-METHODS invoice_totals
      IMPORTING iv_vbeln TYPE vbeln_vf iv_werks TYPE werks_d OPTIONAL RETURNING VALUE(rs_inv) TYPE zcl_tms_ty=>ts_tripinvoice.
    CLASS-METHODS norm_vehicle
      IMPORTING iv_no TYPE csequence RETURNING VALUE(rv_no) TYPE string.
    CLASS-METHODS to_kg
      IMPORTING iv_val TYPE p iv_unit TYPE meins RETURNING VALUE(rv_kg) TYPE zcl_tms_ty=>ts_outdelivery-grossweightkg.
    CLASS-METHODS to_m3
      IMPORTING iv_val TYPE p iv_unit TYPE meins RETURNING VALUE(rv_m3) TYPE zcl_tms_ty=>ts_outdelivery-volumem3.
    CLASS-METHODS einvoice
      IMPORTING iv_vbeln TYPE vbeln_vl CHANGING cs_out TYPE zcl_tms_ty=>ts_outdelivery.
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

  METHOD to_kg.
    rv_kg = SWITCH #( iv_unit WHEN 'KG' THEN iv_val WHEN 'G' THEN iv_val / 1000 WHEN 'TO' THEN iv_val * 1000 WHEN 'LB' THEN iv_val * '0.45359' ELSE iv_val ).
  ENDMETHOD.

  METHOD to_m3.
    rv_m3 = SWITCH #( iv_unit WHEN 'M3' THEN iv_val WHEN 'L' THEN iv_val / 1000 WHEN 'CCM' THEN iv_val / 1000000 WHEN 'FT3' THEN iv_val * '0.0283168' ELSE iv_val ).
  ENDMETHOD.

  METHOD einvoice.
    DATA: lv_bill TYPE vbrk-vbeln, lv_irn TYPE c LENGTH 64, lv_ewb TYPE c LENGTH 20, lv_valid TYPE d.
    SELECT SINGLE vbeln FROM vbfa INTO @lv_bill WHERE vbelv = @iv_vbeln AND vbtyp_n = 'M'.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    DATA(lv_irn_tab) = get_param( iv_name = 'ZTMS_EINV_TABLE' iv_default = 'J_1IG_INVREFNUM' ).
    DATA(lv_ewb_tab) = get_param( iv_name = 'ZTMS_EWB_TABLE' iv_default = 'J_1IG_EWAYBILL' ).
    TRY.
        SELECT SINGLE irn FROM (lv_irn_tab) INTO @lv_irn WHERE docno = @lv_bill AND cancel_date = '00000000'.
        IF sy-subrc = 0.
          cs_out-irn = lv_irn.
        ENDIF.
      CATCH cx_sy_dynamic_osql_error cx_sy_open_sql_db.
        CLEAR cs_out-irn.
    ENDTRY.
    TRY.
        SELECT SINGLE ebillno, vdtodate FROM (lv_ewb_tab) INTO ( @lv_ewb, @lv_valid ) WHERE docno = @lv_bill.
        IF sy-subrc = 0.
          cs_out-ewbno = lv_ewb.
          cs_out-ewbvalid = lv_valid.
        ENDIF.
      CATCH cx_sy_dynamic_osql_error cx_sy_open_sql_db.
        CLEAR: cs_out-ewbno, cs_out-ewbvalid.
    ENDTRY.
  ENDMETHOD.

  METHOD get_out_deliveries.
    DATA lt_range TYPE RANGE OF vbeln_vl.
    LOOP AT it_vbeln INTO DATA(lv_in).
      APPEND VALUE #( sign = 'I' option = 'EQ' low = |{ lv_in ALPHA = IN }| ) TO lt_range.
    ENDLOOP.
    IF lt_range IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lv_carton) = CONV meins( get_param( iv_name = 'ZTMS_CARTON_UOM' iv_default = 'KAR' ) ).
    SELECT h~vbeln, h~kunnr, h~route, h~wadat_ist, h~btgew, h~gewei, h~volum, h~voleh, k~name1
      FROM likp AS h LEFT OUTER JOIN kna1 AS k ON k~kunnr = h~kunnr
      WHERE h~vbeln IN @lt_range
      INTO TABLE @DATA(lt_h).
    LOOP AT lt_h INTO DATA(ls_h).
      DATA(ls_out) = VALUE zcl_tms_ty=>ts_outdelivery( vbeln = ls_h-vbeln kunnr = ls_h-kunnr shiptoname = ls_h-name1 route = ls_h-route
                                                       pgi = COND #( WHEN ls_h-wadat_ist IS NOT INITIAL THEN 'X' ELSE '' ) ).
      SELECT p~matnr, p~lgmng, p~werks, p~brgew, p~gewei, p~volum, p~voleh
        FROM lips AS p WHERE p~vbeln = @ls_h-vbeln AND p~uecha = '000000'
        INTO TABLE @DATA(lt_i).
      DATA: lv_w TYPE p LENGTH 15 DECIMALS 3,
            lv_v TYPE p LENGTH 15 DECIMALS 3.
      CLEAR: lv_w, lv_v.
      LOOP AT lt_i INTO DATA(ls_i).
        IF ls_out-werks IS INITIAL.
          ls_out-werks = ls_i-werks.
        ENDIF.
        SELECT SINGLE umrez, umren FROM marm INTO @DATA(ls_m) WHERE matnr = @ls_i-matnr AND meinh = @lv_carton.
        IF sy-subrc = 0 AND ls_m-umrez > 0.
          ls_out-cartons = ls_out-cartons + ls_i-lgmng * ls_m-umren / ls_m-umrez.
        ENDIF.
        lv_w = lv_w + to_kg( iv_val = ls_i-brgew iv_unit = ls_i-gewei ).
        lv_v = lv_v + to_m3( iv_val = ls_i-volum iv_unit = ls_i-voleh ).
      ENDLOOP.
      " the delivery header weight / volume win when SAP has them (they include packaging), the item sums are the fallback
      ls_out-grossweightkg = COND #( WHEN ls_h-btgew > 0 THEN to_kg( iv_val = ls_h-btgew iv_unit = ls_h-gewei ) ELSE lv_w ).
      ls_out-volumem3 = COND #( WHEN ls_h-volum > 0 THEN to_m3( iv_val = ls_h-volum iv_unit = ls_h-voleh ) ELSE lv_v ).
      einvoice( EXPORTING iv_vbeln = ls_h-vbeln CHANGING cs_out = ls_out ).
      APPEND ls_out TO rt_delivery.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_out_shipment.
    SELECT SINGLE tknum, shtyp, tdlnr, route FROM vttk INTO @DATA(ls_k) WHERE tknum = @iv_tknum.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    rs_shipment = VALUE #( tknum = ls_k-tknum shtyp = ls_k-shtyp tdlnr = ls_k-tdlnr route = ls_k-route ).
    SELECT vbeln FROM vttp INTO TABLE @DATA(lt_d) WHERE tknum = @iv_tknum ORDER BY vbeln.
    LOOP AT lt_d INTO DATA(ls_d).
      rs_shipment-vbelns = COND #( WHEN rs_shipment-vbelns IS INITIAL THEN ls_d-vbeln ELSE |{ rs_shipment-vbelns },{ ls_d-vbeln }| ).
    ENDLOOP.
    SELECT SUM( netwr ) AS net, SUM( mwsbp ) AS tax, waers FROM vfkp
      WHERE rebel = @iv_tknum AND fksto = ''
      GROUP BY waers INTO TABLE @DATA(lt_c).
    IF lt_c IS NOT INITIAL.
      rs_shipment-costnet = lt_c[ 1 ]-net.
      rs_shipment-costtax = lt_c[ 1 ]-tax.
      rs_shipment-waers = lt_c[ 1 ]-waers.
      " settlement status of the cost documents (VFKP-STABR: C = fully settled): C when every document is, otherwise A
      SELECT COUNT( * ) FROM vfkp WHERE rebel = @iv_tknum AND fksto = '' AND stabr <> 'C' INTO @DATA(lv_open).
      rs_shipment-coststatus = COND #( WHEN lv_open > 0 THEN 'A' ELSE 'C' ).
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

  METHOD get_lanes.
    DATA lr_route TYPE RANGE OF zcl_tms_ty=>ts_lane-route.
    DATA lr_lifnr TYPE RANGE OF zcl_tms_ty=>ts_lane-lifnr.
    DATA lr_vsart TYPE RANGE OF zcl_tms_ty=>ts_lane-vsart.
    DATA lr_veh TYPE RANGE OF zcl_tms_ty=>ts_lane-vehicletype.
    lr_route = VALUE #( FOR r IN it_route ( sign = 'I' option = 'EQ' low = to_upper( r ) ) ).
    lr_lifnr = VALUE #( FOR l IN it_lifnr ( sign = 'I' option = 'EQ' low = |{ CONV lifnr( l ) ALPHA = IN }| ) ).
    lr_vsart = VALUE #( FOR v IN it_vsart ( sign = 'I' option = 'EQ' low = v ) ).
    lr_veh = VALUE #( FOR h IN it_vehicle ( sign = 'I' option = 'EQ' low = to_upper( h ) ) ).

    SELECT * FROM zi_tms_lanerate( p_date = @iv_date )
      WHERE route IN @lr_route AND lifnr IN @lr_lifnr AND shippingtype IN @lr_vsart AND vehicletype IN @lr_veh
      INTO TABLE @DATA(lt_r).
    IF lt_r IS INITIAL.
      RETURN.
    ENDIF.

    SELECT route, distz, medst, traztd FROM tvro FOR ALL ENTRIES IN @lt_r WHERE route = @lt_r-route INTO TABLE @DATA(lt_ro).
    SELECT route, bezei FROM tvrot FOR ALL ENTRIES IN @lt_r WHERE route = @lt_r-route AND spras = 'E' INTO TABLE @DATA(lt_rt).
    SELECT route, abnum, knanf, knend FROM tvrab FOR ALL ENTRIES IN @lt_r WHERE route = @lt_r-route INTO TABLE @DATA(lt_st).
    SORT lt_st BY route abnum.
    SELECT lifnr, name1 FROM lfa1 FOR ALL ENTRIES IN @lt_r WHERE lifnr = @lt_r-lifnr INTO TABLE @DATA(lt_lf).
    SELECT add_info, bezei FROM vtadd01t WHERE spras = 'E' INTO TABLE @DATA(lt_vt).
    SELECT vsart, bezei FROM t173t WHERE spras = 'E' INTO TABLE @DATA(lt_vs).

    LOOP AT lt_r INTO DATA(ls_r).
      DATA(ls_l) = VALUE zcl_tms_ty=>ts_lane(
        knumh = ls_r-condrecord condtable = ls_r-condtable kschl = ls_r-condtype shtyp = ls_r-shipmenttype route = ls_r-route
        vehicletype = ls_r-vehicletype ratebasis = ls_r-ratebasis sdabw = ls_r-specialprocessing vsart = ls_r-shippingtype
        zdays = ls_r-zdays lifnr = ls_r-lifnr rate = ls_r-rate waers = ls_r-currency perqty = ls_r-perqty perunit = ls_r-perunit
        calctype = ls_r-calctype validfrom = ls_r-validfrom validto = ls_r-validto ).
      READ TABLE lt_rt INTO DATA(ls_rt) WITH KEY route = ls_r-route.
      IF sy-subrc = 0.
        ls_l-routetext = ls_rt-bezei.
      ENDIF.
      READ TABLE lt_ro INTO DATA(ls_ro) WITH KEY route = ls_r-route.
      IF sy-subrc = 0.
        ls_l-distance = COND #( WHEN ls_ro-medst = 'M' THEN ls_ro-distz / 1000 ELSE ls_ro-distz ).
        ls_l-transith = ( ls_ro-traztd DIV 10000 ) + ( ( ls_ro-traztd MOD 10000 ) DIV 100 ) / 60.
      ENDIF.
      LOOP AT lt_st INTO DATA(ls_st) WHERE route = ls_r-route.
        IF ls_l-fromloc IS INITIAL.
          ls_l-fromloc = ls_st-knanf.
        ENDIF.
        ls_l-toloc = ls_st-knend.
      ENDLOOP.
      READ TABLE lt_lf INTO DATA(ls_lf) WITH KEY lifnr = ls_r-lifnr.
      IF sy-subrc = 0.
        ls_l-vendorname = ls_lf-name1.
      ENDIF.
      READ TABLE lt_vt INTO DATA(ls_vt) WITH KEY add_info = ls_r-vehicletype.
      IF sy-subrc = 0.
        ls_l-vehicletext = ls_vt-bezei.
      ENDIF.
      READ TABLE lt_vs INTO DATA(ls_vs) WITH KEY vsart = ls_r-shippingtype.
      IF sy-subrc = 0.
        ls_l-vsarttext = ls_vs-bezei.
      ENDIF.
      APPEND ls_l TO rt_lane.
    ENDLOOP.

    " rank transporters by rate within one lane + mode
    SORT rt_lane BY shtyp route vehicletype ratebasis vsart sdabw rate lifnr.
    DATA lv_prev TYPE string.
    DATA lv_n TYPE i.
    LOOP AT rt_lane ASSIGNING FIELD-SYMBOL(<l>).
      DATA(lv_key) = |{ <l>-shtyp }{ <l>-route }{ <l>-vehicletype }{ <l>-ratebasis }{ <l>-vsart }{ <l>-sdabw }|.
      IF lv_key <> lv_prev.
        lv_n = 0.
        lv_prev = lv_key.
      ENDIF.
      lv_n = lv_n + 1.
      <l>-priority = COND #( WHEN lv_n > 99 THEN '99' ELSE |{ lv_n }| ).
    ENDLOOP.
  ENDMETHOD.

  METHOD invoice_totals.
    rs_inv-vbeln = iv_vbeln.
    SELECT SINGLE vbeln, fkdat, fksto, kunag, waerk FROM vbrk INTO @DATA(ls_k) WHERE vbeln = @iv_vbeln.
    IF sy-subrc <> 0.
      rs_inv-message = |Billing document { iv_vbeln ALPHA = OUT } was not found in SAP.|.
      RETURN.
    ENDIF.
    rs_inv-fkdat = ls_k-fkdat. rs_inv-kunnr = ls_k-kunag. rs_inv-waers = ls_k-waerk.
    rs_inv-cancelled = COND #( WHEN ls_k-fksto IS NOT INITIAL THEN 'X' ).
    SELECT SINGLE name1 FROM kna1 INTO @rs_inv-name1 WHERE kunnr = @ls_k-kunag.
    SELECT posnr, matnr, fkimg, vrkme, netwr, mwsbp, brgew, ntgew, gewei, werks FROM vbrp INTO TABLE @DATA(lt_p) WHERE vbeln = @iv_vbeln.
    IF lt_p IS INITIAL.
      rs_inv-message = |Billing document { iv_vbeln ALPHA = OUT } has no items.|.
      RETURN.
    ENDIF.
    rs_inv-werks = lt_p[ 1 ]-werks.
    IF iv_werks IS NOT INITIAL.
      DELETE lt_p WHERE werks <> iv_werks.
      IF lt_p IS INITIAL.
        rs_inv-message = |Billing document { iv_vbeln ALPHA = OUT } is for plant { rs_inv-werks }, not { iv_werks }.|.
        RETURN.
      ENDIF.
      rs_inv-werks = iv_werks.
    ENDIF.
    LOOP AT lt_p INTO DATA(ls_p).
      " same rule as ZSMART_VEH (CHK_INV): inside-pack scheme items carry no cartons; others billed qty -> KAR
      SELECT SINGLE @abap_true FROM zmm_tradescheme INTO @DATA(lv_inside)
        WHERE fr_matnr = @ls_p-matnr AND ( plant = @ls_p-werks OR plant = 'DP99' )
          AND fr_date <= @ls_k-fkdat AND to_date >= @ls_k-fkdat AND inside_pack = 'X'.
      IF sy-subrc <> 0.
        SELECT SINGLE @abap_true FROM marm INTO @DATA(lv_kar) WHERE matnr = @ls_p-matnr AND meinh = 'KAR'.
        IF sy-subrc = 0.
          DATA lv_cases TYPE menge_pos.
          CLEAR lv_cases.
          CALL FUNCTION 'MATERIAL_UNIT_CONVERSION'
            EXPORTING input = ls_p-fkimg matnr = ls_p-matnr meinh = 'KAR' meins = ls_p-vrkme
            IMPORTING output = lv_cases
            EXCEPTIONS OTHERS = 1.
          IF sy-subrc = 0.
            rs_inv-cases = rs_inv-cases + lv_cases.
          ENDIF.
        ENDIF.
      ENDIF.
      rs_inv-value = rs_inv-value + ls_p-netwr + ls_p-mwsbp.
      IF ls_p-gewei = 'G'.
        rs_inv-grosskg = rs_inv-grosskg + ls_p-brgew / 1000.
        rs_inv-netkg = rs_inv-netkg + ls_p-ntgew / 1000.
      ELSE.
        rs_inv-grosskg = rs_inv-grosskg + ls_p-brgew.
        rs_inv-netkg = rs_inv-netkg + ls_p-ntgew.
      ENDIF.
    ENDLOOP.
    SELECT SINGLE sin, vehicle_no FROM ztms_trip_inv INTO ( @rs_inv-ttsin, @rs_inv-ttvehicle ) WHERE vbeln = @iv_vbeln AND loekz = ''.
    SELECT SINGLE sin, vehicle_no FROM zinsta_vehicle_i INTO ( @rs_inv-instasin, @rs_inv-instavehicle ) WHERE vbeln = @iv_vbeln AND loekz = ''.
    IF rs_inv-cancelled = 'X'.
      rs_inv-message = |Billing document { iv_vbeln ALPHA = OUT } is cancelled.|.
    ENDIF.
  ENDMETHOD.

  METHOD get_trip_invoices.
    DATA lt_bill TYPE STANDARD TABLE OF vbeln_vf WITH DEFAULT KEY.
    DATA lt_src TYPE SORTED TABLE OF vbfa WITH NON-UNIQUE KEY vbeln.
    LOOP AT it_vbeln INTO DATA(lv_b).
      APPEND CONV vbeln_vf( |{ CONV vbeln_vf( lv_b ) ALPHA = IN }| ) TO lt_bill.
    ENDLOOP.
    IF it_vbelv IS NOT INITIAL.
      DATA lr_dlv TYPE RANGE OF vbeln_von.
      lr_dlv = VALUE #( FOR d IN it_vbelv ( sign = 'I' option = 'EQ' low = |{ CONV vbeln_von( d ) ALPHA = IN }| ) ).
      SELECT * FROM vbfa INTO TABLE @lt_src WHERE vbelv IN @lr_dlv AND vbtyp_n = 'M'.
      LOOP AT lt_src INTO DATA(ls_f).
        APPEND CONV vbeln_vf( ls_f-vbeln ) TO lt_bill.
      ENDLOOP.
    ENDIF.
    SORT lt_bill.
    DELETE ADJACENT DUPLICATES FROM lt_bill.
    LOOP AT lt_bill INTO DATA(lv_bill).
      DATA(ls_inv) = invoice_totals( iv_vbeln = lv_bill iv_werks = iv_werks ).
      READ TABLE lt_src INTO ls_f WITH KEY vbeln = lv_bill.
      IF sy-subrc = 0.
        ls_inv-vbelv = ls_f-vbelv.
      ENDIF.
      APPEND ls_inv TO rt_inv.
    ENDLOOP.
  ENDMETHOD.

  METHOD norm_vehicle.
    rv_no = to_upper( condense( val = iv_no del = ` ` ) ).
    REPLACE ALL OCCURRENCES OF REGEX `[^A-Z0-9]` IN rv_no WITH ``.
  ENDMETHOD.

  METHOD write_trip_vehicle.
    rs_out = is_in.
    CLEAR: rs_out-ok, rs_out-message, rs_out-count, rs_out-target.
    IF is_in-sin IS INITIAL OR is_in-werks IS INITIAL OR is_in-vehicleno IS INITIAL.
      rs_out-message = `Sin, Werks and VehicleNo are required.`.
      RETURN.
    ENDIF.
    " the vehicle's complete invoice list
    DATA lt_want TYPE STANDARD TABLE OF vbeln_vf WITH DEFAULT KEY.
    SPLIT is_in-invoices AT ',' INTO TABLE DATA(lt_parts).
    LOOP AT lt_parts INTO DATA(lv_part).
      CONDENSE lv_part NO-GAPS.
      IF lv_part IS INITIAL.
        CONTINUE.
      ENDIF.
      IF lv_part CN '0123456789' OR strlen( lv_part ) > 10.
        rs_out-message = |"{ lv_part }" is not a billing document number.|.
        RETURN.
      ENDIF.
      APPEND CONV vbeln_vf( |{ CONV vbeln_vf( lv_part ) ALPHA = IN }| ) TO lt_want.
    ENDLOOP.
    SORT lt_want.
    DELETE ADJACENT DUPLICATES FROM lt_want.
    IF lines( lt_want ) > 50.
      rs_out-message = `At most 50 billing documents per vehicle.`.
      RETURN.
    ENDIF.
    " validate everything before writing anything
    DATA lt_tot TYPE zcl_tms_ty=>tt_tripinvoice.
    LOOP AT lt_want INTO DATA(lv_v).
      DATA(ls_t) = invoice_totals( iv_vbeln = lv_v iv_werks = is_in-werks ).
      IF ls_t-message IS NOT INITIAL.
        rs_out-message = ls_t-message.
        RETURN.
      ENDIF.
      IF ls_t-ttsin IS NOT INITIAL AND ls_t-ttsin <> is_in-sin.
        rs_out-message = |Billing document { lv_v ALPHA = OUT } is already on Trip Trail vehicle { ls_t-ttvehicle } ({ ls_t-ttsin }).|.
        RETURN.
      ENDIF.
      APPEND ls_t TO lt_tot.
    ENDLOOP.

    DATA(lv_user) = CONV ztms_trip_inv-hub_user( iv_user ).
    " header
    SELECT SINGLE * FROM ztms_trip_veh INTO @DATA(ls_h) WHERE sin = @is_in-sin AND werks = @is_in-werks.
    IF sy-subrc <> 0.
      ls_h = VALUE #( sin = is_in-sin werks = is_in-werks entry_date = sy-datum ).
    ENDIF.
    ls_h-shipment_id = is_in-shipmentid. ls_h-vehicle_no = is_in-vehicleno. ls_h-delivery = is_in-delivery.
    ls_h-veh_exit = is_in-vehexit. ls_h-hub_user = lv_user. ls_h-chg_on = sy-datum. ls_h-chg_time = sy-uzeit.
    MODIFY ztms_trip_veh FROM ls_h.
    " items: refresh wanted ones, flag the rest
    SELECT * FROM ztms_trip_inv INTO TABLE @DATA(lt_have) WHERE sin = @is_in-sin.
    DATA lt_upd TYPE STANDARD TABLE OF ztms_trip_inv WITH DEFAULT KEY.
    LOOP AT lt_have INTO DATA(ls_have) WHERE loekz = ''.
      IF NOT line_exists( lt_want[ table_line = ls_have-vbeln ] ).
        ls_have-loekz = 'X'. ls_have-chg_by = sy-uname. ls_have-chg_on = sy-datum. ls_have-hub_user = lv_user.
        APPEND ls_have TO lt_upd.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_tot INTO ls_t.
      READ TABLE lt_have INTO ls_have WITH KEY vbeln = ls_t-vbeln.
      IF sy-subrc <> 0.
        ls_have = VALUE #( sin = is_in-sin vbeln = ls_t-vbeln crt_by = sy-uname crt_on = sy-datum ).
      ELSEIF ls_have-loekz = 'X'.
        CLEAR ls_have-loekz.
        ls_have-chg_by = sy-uname. ls_have-chg_on = sy-datum.
      ENDIF.
      ls_have-werks = is_in-werks. ls_have-vehicle_no = is_in-vehicleno. ls_have-nop = ls_t-cases. ls_have-material_value = ls_t-value.
      ls_have-waers = ls_t-waers. ls_have-gross_weight = ls_t-grosskg. ls_have-net_weight = ls_t-netkg. ls_have-hub_user = lv_user.
      APPEND ls_have TO lt_upd.
    ENDLOOP.
    IF lt_upd IS NOT INITIAL.
      MODIFY ztms_trip_inv FROM TABLE lt_upd.
    ENDIF.
    rs_out-target = 'TRIPTRAIL'.

    " cutover only: also the Instavans tables read by ZSTOCK_NEW / ZSTKTR_REP2 / ZPWC_BUDGET (truck number per invoice)
    DATA(lv_insta) = COND abap_bool( WHEN iv_insta IS SUPPLIED THEN iv_insta ELSE xsdbool( get_param( 'ZTMS_INSTA_WRITE' ) = 'X' ) ).
    IF lv_insta = abap_true.
      DATA(lv_ship) = COND zinsta_vehicle_h-shipment_id( WHEN is_in-shipmentid IS NOT INITIAL THEN is_in-shipmentid ELSE is_in-sin ).
      DATA(ls_ih) = VALUE zinsta_vehicle_h( sin = is_in-sin shipment_id = lv_ship werks = is_in-werks vehicle_no = is_in-vehicleno
                                            delivery = is_in-delivery entry_date = ls_h-entry_date veh_exit = is_in-vehexit ).
      MODIFY zinsta_vehicle_h FROM ls_ih.
      DATA lt_ii TYPE STANDARD TABLE OF zinsta_vehicle_i WITH DEFAULT KEY.
      LOOP AT lt_upd INTO ls_have.
        APPEND VALUE zinsta_vehicle_i( sin = is_in-sin shipment_id = lv_ship vbeln = ls_have-vbeln werks = ls_have-werks vehicle_no = ls_have-vehicle_no
          nop = ls_have-nop material_value = ls_have-material_value gross_weight = ls_have-gross_weight net_weight = ls_have-net_weight
          loekz = ls_have-loekz crt_by = ls_have-crt_by crt_on = ls_have-crt_on chg_by = ls_have-chg_by chg_on = ls_have-chg_on ) TO lt_ii.
      ENDLOOP.
      IF lt_ii IS NOT INITIAL.
        MODIFY zinsta_vehicle_i FROM TABLE lt_ii.
      ENDIF.
      rs_out-target = 'TRIPTRAIL+INSTAVANS'.
    ENDIF.
    rs_out-ok = 'X'.
    rs_out-count = |{ lines( lt_want ) }|.
    rs_out-message = |{ lines( lt_want ) } billing document(s) on vehicle { is_in-vehicleno } saved ({ rs_out-target }).|.
  ENDMETHOD.

  METHOD parallel_check.
    DATA(lv_from) = CONV d( sy-datum - iv_days ).
    DATA lr_w TYPE RANGE OF werks_d.
    IF iv_werks IS NOT INITIAL.
      lr_w = VALUE #( ( sign = 'I' option = 'EQ' low = iv_werks ) ( sign = 'I' option = 'EQ' low = '' ) ).
    ENDIF.
    SELECT vbeln, sin, vehicle_no, werks, crt_on FROM ztms_trip_inv INTO TABLE @DATA(lt_tt)
      WHERE loekz = '' AND crt_on >= @lv_from AND werks IN @lr_w.
    SELECT vbeln, sin, vehicle_no, werks, crt_on FROM zinsta_vehicle_i INTO TABLE @DATA(lt_in)
      WHERE loekz = '' AND crt_on >= @lv_from AND werks IN @lr_w.
    " complete each side for documents the other side has (any date)
    IF lt_tt IS NOT INITIAL.
      SELECT vbeln, sin, vehicle_no, werks, crt_on FROM zinsta_vehicle_i APPENDING TABLE @lt_in
        FOR ALL ENTRIES IN @lt_tt WHERE vbeln = @lt_tt-vbeln AND loekz = ''.
    ENDIF.
    IF lt_in IS NOT INITIAL.
      SELECT vbeln, sin, vehicle_no, werks, crt_on FROM ztms_trip_inv APPENDING TABLE @lt_tt
        FOR ALL ENTRIES IN @lt_in WHERE vbeln = @lt_in-vbeln AND loekz = ''.
    ENDIF.
    SORT lt_tt BY vbeln. DELETE ADJACENT DUPLICATES FROM lt_tt COMPARING vbeln.
    SORT lt_in BY vbeln. DELETE ADJACENT DUPLICATES FROM lt_in COMPARING vbeln.
    DATA lt_all TYPE SORTED TABLE OF vbeln_vf WITH UNIQUE KEY table_line.
    LOOP AT lt_tt INTO DATA(ls_tt).
      INSERT ls_tt-vbeln INTO TABLE lt_all.
    ENDLOOP.
    LOOP AT lt_in INTO DATA(ls_in).
      INSERT ls_in-vbeln INTO TABLE lt_all.
    ENDLOOP.
    LOOP AT lt_all INTO DATA(lv_v).
      DATA(ls_c) = VALUE zcl_tms_ty=>ts_parallelcheck( vbeln = lv_v days = |{ iv_days }| ).
      READ TABLE lt_tt INTO ls_tt WITH KEY vbeln = lv_v BINARY SEARCH.
      DATA(lv_has_tt) = xsdbool( sy-subrc = 0 ).
      IF lv_has_tt = abap_true.
        ls_c-ttsin = ls_tt-sin. ls_c-ttvehicle = ls_tt-vehicle_no. ls_c-tton = ls_tt-crt_on. ls_c-werks = ls_tt-werks.
      ENDIF.
      READ TABLE lt_in INTO ls_in WITH KEY vbeln = lv_v BINARY SEARCH.
      DATA(lv_has_in) = xsdbool( sy-subrc = 0 ).
      IF lv_has_in = abap_true.
        ls_c-instasin = ls_in-sin. ls_c-instavehicle = ls_in-vehicle_no. ls_c-instaon = ls_in-crt_on.
        IF ls_c-werks IS INITIAL.
          ls_c-werks = ls_in-werks.
        ENDIF.
      ENDIF.
      ls_c-status = COND #( WHEN lv_has_tt = abap_true AND lv_has_in = abap_false THEN 'TT_ONLY'
                            WHEN lv_has_tt = abap_false THEN 'INSTA_ONLY'
                            WHEN norm_vehicle( ls_c-ttvehicle ) = norm_vehicle( ls_c-instavehicle ) THEN 'MATCH'
                            ELSE 'DIFF' ).
      APPEND ls_c TO rt_chk.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_freight_cond.
    DATA lr_route TYPE RANGE OF zcl_tms_ty=>ts_freightcond-route.
    DATA lr_tdlnr TYPE RANGE OF zcl_tms_ty=>ts_freightcond-tdlnr.
    DATA lr_kschl TYPE RANGE OF zcl_tms_ty=>ts_freightcond-kschl.
    DATA lr_vsart TYPE RANGE OF zcl_tms_ty=>ts_freightcond-vsart.
    DATA lr_shtyp TYPE RANGE OF zcl_tms_ty=>ts_freightcond-shtyp.
    DATA lr_add01 TYPE RANGE OF zcl_tms_ty=>ts_freightcond-add01.
    lr_route = VALUE #( FOR r IN it_route ( sign = 'I' option = 'EQ' low = to_upper( r ) ) ).
    lr_tdlnr = VALUE #( FOR l IN it_tdlnr ( sign = 'I' option = 'EQ' low = |{ CONV lifnr( l ) ALPHA = IN }| ) ).
    lr_kschl = VALUE #( FOR k IN it_kschl ( sign = 'I' option = 'EQ' low = to_upper( k ) ) ).
    lr_vsart = VALUE #( FOR v IN it_vsart ( sign = 'I' option = 'EQ' low = v ) ).
    lr_shtyp = VALUE #( FOR t IN it_shtyp ( sign = 'I' option = 'EQ' low = to_upper( t ) ) ).
    lr_add01 = VALUE #( FOR a IN it_add01 ( sign = 'I' option = 'EQ' low = to_upper( a ) ) ).
    DATA(lv_up) = nmax( val1 = 1 val2 = iv_skip + iv_top ).
    SELECT knumh, kappl, kschl, shtyp, route, add01, add02, sdabw, tdlnr, zdays, vsart, datab, datbi,
           vendorname, vendorregion, addressnumber, vendoremail, routetext
      FROM zi_tms_a964_vendor
      WHERE route IN @lr_route AND tdlnr IN @lr_tdlnr AND kschl IN @lr_kschl AND vsart IN @lr_vsart AND shtyp IN @lr_shtyp AND add01 IN @lr_add01
      ORDER BY route, tdlnr, datbi DESCENDING, knumh
      INTO CORRESPONDING FIELDS OF TABLE @rt_cond
      UP TO @lv_up ROWS.
    IF iv_skip > 0.
      DELETE rt_cond TO iv_skip.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
