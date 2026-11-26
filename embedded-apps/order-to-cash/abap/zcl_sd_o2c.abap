CLASS zcl_sd_o2c DEFINITION PUBLIC FINAL CREATE PUBLIC.
  " Order to Cash (Emami Apps, embedded-apps/order-to-cash). One entry point: HANDLE( action, JSON payload ) -> JSON.
  " Called by RFC function module Z_SD_O2C_ACTION (SOAP-RFC from the Emami Apps backend, backend/orderToCash.js).
  " Reads: PING, CUSTOMER_SEARCH, MATERIAL_SEARCH, VALIDATE_PO, LIST_ORDERS, LIST_BACKORDERS, LIST_DELIVERIES,
  "        DELIVERY_ITEMS, LIST_INVOICES, INVOICE_ITEMS, LIST_OPEN_ITEMS, LIST_DEDUCTIONS.
  " Writes: CREATE_SO (BAPI_SALESORDER_CREATEFROMDAT2; TESTRUN = BAPI_SALESORDER_SIMULATE), CREATE_DELIVERY
  "         (BAPI_OUTB_DELIVERY_CREATE_SLS). Nothing else changes SAP data. JSON names are the ABAP names (upper case).
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_hdr,
             kunnr         TYPE kunnr,
             kunwe         TYPE kunnr,
             vkorg         TYPE vkorg,
             vtweg         TYPE vtweg,
             spart         TYPE spart,
             auart         TYPE auart,
             bstkd         TYPE bstkd,
             prsdt         TYPE char8,
             bstdk         TYPE char8,
             vdatu         TYPE char8,
             price_from_po TYPE char1,
           END OF ty_hdr,
           BEGIN OF ty_line,
             line     TYPE i,
             posnr    TYPE char6,
             matnr    TYPE matnr,
             cust_mat TYPE char35,
             ean      TYPE ean11,
             qty      TYPE p LENGTH 13 DECIMALS 3,
             uom      TYPE char6,
             price    TYPE p LENGTH 13 DECIMALS 2,
           END OF ty_line,
           ty_lines TYPE STANDARD TABLE OF ty_line WITH DEFAULT KEY,
           BEGIN OF ty_dlv_item,
             vbeln TYPE vbeln_va,
             posnr TYPE posnr_va,
             qty   TYPE p LENGTH 13 DECIMALS 3,
           END OF ty_dlv_item,
           BEGIN OF ty_in,
             request_id TYPE char40,
             header     TYPE ty_hdr,
             lines      TYPE ty_lines,
             items      TYPE STANDARD TABLE OF ty_line WITH DEFAULT KEY,
             dlv_items  TYPE STANDARD TABLE OF ty_dlv_item WITH DEFAULT KEY,
             testrun    TYPE char1,
             term       TYPE string,
             kunnr      TYPE kunnr,
             vkorg      TYPE vkorg,
             vtweg      TYPE vtweg,
             date_from  TYPE char8,
             date_to    TYPE char8,
             max_rows   TYPE i,
             pgi_done   TYPE char1,
             vbelns     TYPE STANDARD TABLE OF vbeln WITH DEFAULT KEY,
             kunnrs     TYPE STANDARD TABLE OF kunnr WITH DEFAULT KEY,
           END OF ty_in,
           BEGIN OF ty_msg,
             type    TYPE char1,
             id      TYPE char20,
             number  TYPE char3,
             message TYPE string,
           END OF ty_msg,
           ty_msgs TYPE STANDARD TABLE OF ty_msg WITH DEFAULT KEY.

    CLASS-METHODS handle IMPORTING iv_action TYPE csequence iv_payload TYPE string RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    TYPES: ty_r_vkorg TYPE RANGE OF vkorg, ty_r_kunnr TYPE RANGE OF kunnr.
    CLASS-DATA gs_in TYPE ty_in.
    CLASS-METHODS r_vkorg RETURNING VALUE(rv) TYPE ty_r_vkorg.
    CLASS-METHODS r_kunnr RETURNING VALUE(rv) TYPE ty_r_kunnr.
    CLASS-METHODS to_json IMPORTING data TYPE any RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS rows_json IMPORTING rows TYPE ANY TABLE iv_max TYPE i RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS max_rows RETURNING VALUE(rv) TYPE i.
    CLASS-METHODS date_from RETURNING VALUE(rv) TYPE d.
    CLASS-METHODS date_to RETURNING VALUE(rv) TYPE d.
    CLASS-METHODS ymd IMPORTING iv TYPE d RETURNING VALUE(rv) TYPE char8.
    CLASS-METHODS comp IMPORTING is TYPE any iv_names TYPE string RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS set_comp IMPORTING iv_name TYPE csequence iv_value TYPE any CHANGING cs TYPE any.
    CLASS-METHODS add_msgs IMPORTING it_ret TYPE bapiret2_t CHANGING ct TYPE ty_msgs.
    CLASS-METHODS has_error IMPORTING it_ret TYPE bapiret2_t RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS default_auart IMPORTING iv_kunnr TYPE kunnr iv_vkorg TYPE vkorg RETURNING VALUE(rv) TYPE auart.
    CLASS-METHODS sales_unit IMPORTING iv_uom TYPE csequence iv_matnr TYPE matnr iv_vkorg TYPE vkorg iv_vtweg TYPE vtweg RETURNING VALUE(rv) TYPE vrkme.
    CLASS-METHODS simulate IMPORTING is_hdr TYPE ty_hdr it_lines TYPE ty_lines
                           EXPORTING et_items TYPE STANDARD TABLE et_msgs TYPE ty_msgs ev_net TYPE netwr ev_waerk TYPE waerk ev_credit TYPE char1.
    CLASS-METHODS ping RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS customer_search RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS material_search RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS validate_po RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS create_so RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_orders RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_backorders RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS create_delivery RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_deliveries RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS delivery_items RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_invoices RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS invoice_items RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_open_items RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS list_deductions RETURNING VALUE(rv) TYPE string.
ENDCLASS.



CLASS zcl_sd_o2c IMPLEMENTATION.

  METHOD handle.
    DATA lx TYPE REF TO cx_root.
    CLEAR gs_in.
    TRY.
        IF iv_payload IS NOT INITIAL.
          /ui2/cl_json=>deserialize( EXPORTING json = iv_payload CHANGING data = gs_in ).
        ENDIF.
        " CREATE_DELIVERY sends ITEMS as order lines (VBELN, POSNR, QTY)
        IF iv_action = 'CREATE_DELIVERY' AND iv_payload IS NOT INITIAL.
          DATA(lv_p) = replace( val = iv_payload sub = `"ITEMS"` with = `"DLV_ITEMS"` occ = 1 ).
          /ui2/cl_json=>deserialize( EXPORTING json = lv_p CHANGING data = gs_in ).
        ENDIF.
        CASE to_upper( iv_action ).
          WHEN 'PING'.            rv_json = ping( ).
          WHEN 'CUSTOMER_SEARCH'. rv_json = customer_search( ).
          WHEN 'MATERIAL_SEARCH'. rv_json = material_search( ).
          WHEN 'VALIDATE_PO'.     rv_json = validate_po( ).
          WHEN 'CREATE_SO'.       rv_json = create_so( ).
          WHEN 'LIST_ORDERS'.     rv_json = list_orders( ).
          WHEN 'LIST_BACKORDERS'. rv_json = list_backorders( ).
          WHEN 'CREATE_DELIVERY'. rv_json = create_delivery( ).
          WHEN 'LIST_DELIVERIES'. rv_json = list_deliveries( ).
          WHEN 'DELIVERY_ITEMS'.  rv_json = delivery_items( ).
          WHEN 'LIST_INVOICES'.   rv_json = list_invoices( ).
          WHEN 'INVOICE_ITEMS'.   rv_json = invoice_items( ).
          WHEN 'LIST_OPEN_ITEMS'. rv_json = list_open_items( ).
          WHEN 'LIST_DEDUCTIONS'. rv_json = list_deductions( ).
          WHEN OTHERS.
            rv_json = |\{"ERROR":"Unknown action { iv_action }"\}|.
        ENDCASE.
      CATCH cx_root INTO lx.
        DATA(lv_text) = lx->get_text( ).
        REPLACE ALL OCCURRENCES OF `"` IN lv_text WITH `'`.
        REPLACE ALL OCCURRENCES OF `\` IN lv_text WITH `/`.
        rv_json = |\{"ERROR":"{ lv_text }"\}|.
    ENDTRY.
  ENDMETHOD.

  METHOD to_json.
    rv = /ui2/cl_json=>serialize( data = data compress = abap_false pretty_name = /ui2/cl_json=>pretty_mode-none ).
  ENDMETHOD.

  METHOD rows_json.
    DATA lv_trunc TYPE char1.
    IF lines( rows ) >= iv_max.
      lv_trunc = 'X'.
    ENDIF.
    rv = |\{"ROWS":{ to_json( rows ) },"TRUNCATED":"{ lv_trunc }"\}|.
  ENDMETHOD.

  METHOD max_rows.
    rv = gs_in-max_rows.
    IF rv <= 0 OR rv > 20000.
      rv = 2000.
    ENDIF.
  ENDMETHOD.

  METHOD date_from.
    IF gs_in-date_from CO '0123456789' AND strlen( gs_in-date_from ) = 8.
      rv = gs_in-date_from.
    ELSE.
      rv = sy-datum - 30.
    ENDIF.
  ENDMETHOD.

  METHOD date_to.
    IF gs_in-date_to CO '0123456789' AND strlen( gs_in-date_to ) = 8.
      rv = gs_in-date_to.
    ELSE.
      rv = sy-datum.
    ENDIF.
  ENDMETHOD.

  METHOD r_vkorg.
    IF gs_in-vkorg IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = gs_in-vkorg ) TO rv.
    ENDIF.
  ENDMETHOD.

  METHOD r_kunnr.
    IF gs_in-kunnr IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = |{ gs_in-kunnr ALPHA = IN }| ) TO rv.
    ENDIF.
  ENDMETHOD.

  METHOD ymd.
    IF iv IS INITIAL OR iv = '00000000'.
      rv = ''.
    ELSE.
      rv = iv.
    ENDIF.
  ENDMETHOD.

  METHOD comp.
    " First existing component of the structure from a comma list (BAPI structure names differ between releases).
    SPLIT iv_names AT ',' INTO TABLE DATA(lt_names).
    LOOP AT lt_names INTO DATA(lv_name).
      ASSIGN COMPONENT lv_name OF STRUCTURE is TO FIELD-SYMBOL(<v>).
      IF sy-subrc = 0.
        rv = |{ <v> }|.
        CONDENSE rv.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD set_comp.
    ASSIGN COMPONENT iv_name OF STRUCTURE cs TO FIELD-SYMBOL(<v>).
    IF sy-subrc = 0.
      <v> = iv_value.
    ENDIF.
  ENDMETHOD.

  METHOD add_msgs.
    LOOP AT it_ret INTO DATA(ls).
      APPEND VALUE #( type = ls-type id = ls-id number = ls-number message = ls-message ) TO ct.
    ENDLOOP.
  ENDMETHOD.

  METHOD has_error.
    LOOP AT it_ret TRANSPORTING NO FIELDS WHERE type = 'E' OR type = 'A' OR type = 'X'.
      rv = abap_true.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD default_auart.
    " The order type this customer was last ordered with in this sales org; else OR.
    SELECT auart FROM vbak INTO @rv UP TO 1 ROWS
      WHERE kunnr = @iv_kunnr AND vkorg = @iv_vkorg AND vbtyp = 'C' ORDER BY erdat DESCENDING.
    ENDSELECT.
    IF rv IS INITIAL.
      rv = 'OR'.
    ENDIF.
  ENDMETHOD.

  METHOD sales_unit.
    " The PO's unit when SAP knows it (external -> internal), else the material's sales unit, else the base unit.
    DATA lv_in TYPE meins.
    IF iv_uom IS NOT INITIAL.
      TRY.
          CALL FUNCTION 'CONVERSION_EXIT_CUNIT_INPUT'
            EXPORTING input = iv_uom language = sy-langu
            IMPORTING output = lv_in
            EXCEPTIONS unit_not_found = 1 OTHERS = 2.
          IF sy-subrc = 0.
            SELECT SINGLE meinh FROM marm INTO @DATA(lv_alt) WHERE matnr = @iv_matnr AND meinh = @lv_in.
            IF sy-subrc = 0.
              rv = lv_in.
              RETURN.
            ENDIF.
          ENDIF.
        CATCH cx_root.
      ENDTRY.
    ENDIF.
    SELECT SINGLE vrkme FROM mvke INTO @rv WHERE matnr = @iv_matnr AND vkorg = @iv_vkorg AND vtweg = @iv_vtweg.
    IF rv IS INITIAL.
      SELECT SINGLE meins FROM mara INTO @rv WHERE matnr = @iv_matnr.
    ENDIF.
  ENDMETHOD.

  METHOD ping.
    rv = |\{"SYSTEM":"{ sy-sysid }","CLIENT":"{ sy-mandt }","USER":"{ sy-uname }","RELEASE":"{ sy-saprl }"\}|.
  ENDMETHOD.

  METHOD customer_search.
    TYPES: BEGIN OF ty_c, kunnr TYPE kunnr, name1 TYPE name1_gp, ort01 TYPE ort01_gp, stcd3 TYPE stcd3,
             vkorg TYPE vkorg, vtweg TYPE vtweg, spart TYPE spart, END OF ty_c.
    DATA lt TYPE STANDARD TABLE OF ty_c.
    DATA(lv_term) = condense( to_upper( gs_in-term ) ).
    DATA(lv_like) = |%{ lv_term }%|.
    DATA(lv_kunnr) = CONV kunnr( |{ lv_term ALPHA = IN }| ).
    DATA(lv_max) = nmin( val1 = max_rows( ) val2 = 100 ).
    DATA(lr_vkorg) = r_vkorg( ).
    SELECT k~kunnr, k~name1, k~ort01, k~stcd3, v~vkorg, v~vtweg, v~spart
      FROM kna1 AS k INNER JOIN knvv AS v ON v~kunnr = k~kunnr
      WHERE ( k~kunnr = @lv_kunnr OR k~mcod1 LIKE @lv_like OR k~stcd3 = @lv_term OR k~sortl LIKE @lv_like )
        AND k~loevm = '' AND v~loevm = '' AND v~vkorg IN @lr_vkorg
      ORDER BY k~name1
      INTO TABLE @lt UP TO @lv_max ROWS.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD material_search.
    TYPES: BEGIN OF ty_m, matnr TYPE matnr, maktx TYPE maktx, ean11 TYPE ean11, kdmat TYPE kdmat, meins TYPE meins, END OF ty_m.
    TYPES: BEGIN OF ty_m2, matnr TYPE matnr, maktx TYPE maktx, ean11 TYPE ean11, meins TYPE meins, END OF ty_m2.
    DATA lt TYPE STANDARD TABLE OF ty_m.
    DATA lt2 TYPE STANDARD TABLE OF ty_m2.
    DATA(lr_vkorg) = r_vkorg( ).
    DATA(lv_term) = condense( to_upper( gs_in-term ) ).
    DATA(lv_like) = |%{ lv_term }%|.
    DATA(lv_matnr) = CONV matnr( |{ lv_term ALPHA = IN }| ).
    DATA(lv_max) = nmin( val1 = max_rows( ) val2 = 100 ).
    " the customer's own article number first
    IF gs_in-kunnr IS NOT INITIAL.
      SELECT n~matnr, t~maktx, m~ean11, n~kdmat, m~meins
        FROM knmt AS n INNER JOIN mara AS m ON m~matnr = n~matnr
        LEFT OUTER JOIN makt AS t ON t~matnr = n~matnr AND t~spras = @sy-langu
        WHERE n~kunnr = @gs_in-kunnr AND ( n~kdmat LIKE @lv_like OR n~kdmat = @gs_in-term ) AND n~vkorg IN @lr_vkorg
        INTO TABLE @lt UP TO @lv_max ROWS.
    ENDIF.
    SELECT m~matnr, t~maktx, m~ean11, m~meins
      FROM mara AS m LEFT OUTER JOIN makt AS t ON t~matnr = m~matnr AND t~spras = @sy-langu
      WHERE ( m~matnr = @lv_matnr OR m~ean11 = @lv_term OR t~maktg LIKE @lv_like ) AND m~lvorm = ''
      INTO TABLE @lt2 UP TO @lv_max ROWS.
    SELECT e~matnr, t~maktx, e~ean11, m~meins
      FROM mean AS e INNER JOIN mara AS m ON m~matnr = e~matnr
      LEFT OUTER JOIN makt AS t ON t~matnr = e~matnr AND t~spras = @sy-langu
      WHERE e~ean11 = @lv_term
      APPENDING TABLE @lt2 UP TO 20 ROWS.
    LOOP AT lt2 INTO DATA(ls_m2).
      APPEND CORRESPONDING #( ls_m2 ) TO lt.
    ENDLOOP.
    SORT lt BY matnr kdmat DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt COMPARING matnr.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD simulate.
    " BAPI_SALESORDER_SIMULATE: SAP pricing, availability (confirmed qty) and credit, without saving.
    TYPES: BEGIN OF ty_it, posnr TYPE char6, matnr TYPE matnr, qty TYPE p LENGTH 13 DECIMALS 3, netpr TYPE p LENGTH 13 DECIMALS 2,
             netwr TYPE p LENGTH 15 DECIMALS 2, conf_qty TYPE p LENGTH 13 DECIMALS 3, mrp TYPE p LENGTH 13 DECIMALS 2, END OF ty_it.
    DATA: ls_head TYPE bapisdhead, lt_items TYPE STANDARD TABLE OF bapiitemin, lt_part TYPE STANDARD TABLE OF bapipartnr,
          lt_sched TYPE STANDARD TABLE OF bapischdl, lt_out TYPE STANDARD TABLE OF bapiitemex, lt_sx TYPE STANDARD TABLE OF bapisdhedu,
          lt_msg TYPE bapiret2_t, ls_ret TYPE bapireturn, lt_it TYPE STANDARD TABLE OF ty_it, lt_cond TYPE STANDARD TABLE OF bapicond.
    CLEAR: et_items, et_msgs, ev_net, ev_waerk, ev_credit.
    ls_head-doc_type = COND #( WHEN is_hdr-auart IS NOT INITIAL THEN is_hdr-auart ELSE default_auart( iv_kunnr = is_hdr-kunnr iv_vkorg = is_hdr-vkorg ) ).
    ls_head-sales_org = is_hdr-vkorg.
    ls_head-distr_chan = is_hdr-vtweg.
    ls_head-division = is_hdr-spart.
    set_comp( EXPORTING iv_name = 'PURCH_NO' iv_value = is_hdr-bstkd CHANGING cs = ls_head ).
    IF is_hdr-vdatu CO '0123456789' AND strlen( is_hdr-vdatu ) = 8 AND is_hdr-vdatu >= sy-datum.
      set_comp( EXPORTING iv_name = 'REQ_DATE_H' iv_value = is_hdr-vdatu CHANGING cs = ls_head ).
    ENDIF.
    APPEND VALUE #( partn_role = 'AG' partn_numb = is_hdr-kunnr ) TO lt_part.
    APPEND VALUE #( partn_role = 'WE' partn_numb = COND #( WHEN is_hdr-kunwe IS NOT INITIAL THEN is_hdr-kunwe ELSE is_hdr-kunnr ) ) TO lt_part.
    LOOP AT it_lines INTO DATA(ls_l) WHERE matnr IS NOT INITIAL AND qty > 0.
      DATA(lv_posnr) = CONV posnr_va( COND i( WHEN ls_l-line > 0 THEN ls_l-line ELSE ls_l-posnr ) ).
      DATA ls_item TYPE bapiitemin.
      CLEAR ls_item.
      ls_item-itm_number = lv_posnr.
      ls_item-material = ls_l-matnr.
      set_comp( EXPORTING iv_name = 'SALES_UNIT' iv_value = sales_unit( iv_uom = ls_l-uom iv_matnr = ls_l-matnr iv_vkorg = is_hdr-vkorg iv_vtweg = is_hdr-vtweg ) CHANGING cs = ls_item ).
      APPEND ls_item TO lt_items.
      DATA ls_s TYPE bapischdl.
      CLEAR ls_s.
      ls_s-itm_number = lv_posnr.
      ls_s-req_qty = ls_l-qty.
      APPEND ls_s TO lt_sched.
      APPEND VALUE #( posnr = lv_posnr matnr = ls_l-matnr qty = ls_l-qty ) TO lt_it.
    ENDLOOP.
    IF lt_items IS INITIAL.
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_SALESORDER_SIMULATE'
      EXPORTING order_header_in = ls_head
      IMPORTING return = ls_ret
      TABLES order_items_in = lt_items order_partners = lt_part order_schedule_in = lt_sched
             order_items_out = lt_out order_schedule_ex = lt_sx order_condition_ex = lt_cond messagetable = lt_msg.
    add_msgs( EXPORTING it_ret = lt_msg CHANGING ct = et_msgs ).
    IF ls_ret-type IS NOT INITIAL AND ls_ret-message IS NOT INITIAL.
      APPEND VALUE #( type = ls_ret-type id = ls_ret-code message = ls_ret-message ) TO et_msgs.
    ENDIF.
    LOOP AT et_msgs INTO DATA(ls_m).
      IF to_upper( ls_m-message ) CS 'CREDIT'.
        ev_credit = 'X'.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_it ASSIGNING FIELD-SYMBOL(<it>).
      LOOP AT lt_out INTO DATA(ls_o).
        IF |{ comp( is = ls_o iv_names = 'ITM_NUMBER' ) ALPHA = IN WIDTH = 6 }| = <it>-posnr.
          " NET_VALUE is an old BAPI amount with the decimals implied (122200 = 1222.00); NET_VALUE1 is the real amount
          <it>-netwr = comp( is = ls_o iv_names = 'NET_VALUE1,NETWR' ).
          IF <it>-qty > 0.
            <it>-netpr = <it>-netwr / <it>-qty.
          ENDIF.
          ev_waerk = comp( is = ls_o iv_names = 'CURRENCY,CURR_ISO,DOC_CURR' ).
        ENDIF.
      ENDLOOP.
      LOOP AT lt_sx INTO DATA(ls_x).
        IF |{ comp( is = ls_x iv_names = 'ITM_NUMBER' ) ALPHA = IN WIDTH = 6 }| = <it>-posnr.
          <it>-conf_qty = <it>-conf_qty + CONV decfloat34( comp( is = ls_x iv_names = 'CONFIR_QTY,CONF_QTY' ) ).
        ENDIF.
      ENDLOOP.
      " MRP: condition ZMRP (Emami's MRP condition), value per unit
      LOOP AT lt_cond INTO DATA(ls_c).
        IF comp( is = ls_c iv_names = 'COND_TYPE' ) = 'ZMRP' AND |{ comp( is = ls_c iv_names = 'ITM_NUMBER' ) ALPHA = IN WIDTH = 6 }| = <it>-posnr.
          <it>-mrp = comp( is = ls_c iv_names = 'COND_VALUE' ).
        ENDIF.
      ENDLOOP.
      ev_net = ev_net + <it>-netwr.
    ENDLOOP.
    et_items = lt_it.
  ENDMETHOD.

  METHOD validate_po.
    " Every check SAP can make before the order exists. Prices come from the simulation (all conditions), stock from its
    " confirmed quantity, case lot from MVKE-SCMNG (delivery unit).
    TYPES: BEGIN OF ty_res, line TYPE i, matnr TYPE matnr, maktx TYPE maktx, mapped_by TYPE char12, mat_ok TYPE char1, listed TYPE char1,
             sales_status TYPE char2, sap_price TYPE p LENGTH 13 DECIMALS 2, sap_mrp TYPE p LENGTH 13 DECIMALS 2, round_qty TYPE p LENGTH 13 DECIMALS 3,
             atp_qty TYPE p LENGTH 13 DECIMALS 3, base_uom TYPE meins, message TYPE string, END OF ty_res,
           BEGIN OF ty_it, posnr TYPE char6, matnr TYPE matnr, qty TYPE p LENGTH 13 DECIMALS 3, netpr TYPE p LENGTH 13 DECIMALS 2,
             netwr TYPE p LENGTH 15 DECIMALS 2, conf_qty TYPE p LENGTH 13 DECIMALS 3, mrp TYPE p LENGTH 13 DECIMALS 2, END OF ty_it.
    DATA: lt_res TYPE STANDARD TABLE OF ty_res, lt_lines TYPE ty_lines, lt_it TYPE STANDARD TABLE OF ty_it, lt_msgs TYPE ty_msgs,
          lv_net TYPE netwr, lv_waerk TYPE waerk, lv_credit TYPE char1.
    DATA(ls_h) = gs_in-header.
    ls_h-kunnr = |{ ls_h-kunnr ALPHA = IN }|.
    ls_h-kunwe = COND #( WHEN ls_h-kunwe IS NOT INITIAL THEN |{ ls_h-kunwe ALPHA = IN }| ).
    " header
    DATA lv_kunnr_ok TYPE char1.
    SELECT SINGLE k~name1 FROM kna1 AS k INNER JOIN knvv AS v ON v~kunnr = k~kunnr
      WHERE k~kunnr = @ls_h-kunnr AND v~vkorg = @ls_h-vkorg AND v~vtweg = @ls_h-vtweg AND v~spart = @ls_h-spart AND v~loevm = '' AND k~loevm = ''
      INTO @DATA(lv_name1).
    IF sy-subrc = 0.
      lv_kunnr_ok = 'X'.
    ENDIF.
    DATA lv_dup TYPE vbeln_va.
    IF ls_h-bstkd IS NOT INITIAL.
      SELECT SINGLE vbeln FROM vbak INTO @lv_dup WHERE kunnr = @ls_h-kunnr AND bstnk = @ls_h-bstkd AND vbtyp = 'C'.
    ENDIF.
    " lines: map, check listing / status
    LOOP AT gs_in-lines INTO DATA(ls_l).
      DATA(ls_r) = VALUE ty_res( line = ls_l-line mat_ok = 'Y' listed = 'Y' ).
      DATA(lv_matnr) = ls_l-matnr.
      IF lv_matnr IS NOT INITIAL.
        lv_matnr = |{ lv_matnr ALPHA = IN }|.
        SELECT SINGLE matnr FROM mara INTO @lv_matnr WHERE matnr = @lv_matnr AND lvorm = ''.
        IF sy-subrc <> 0.
          CLEAR lv_matnr.
        ELSE.
          ls_r-mapped_by = 'GIVEN'.
        ENDIF.
      ENDIF.
      IF lv_matnr IS INITIAL AND ls_l-cust_mat IS NOT INITIAL.
        SELECT SINGLE matnr FROM knmt INTO @lv_matnr WHERE kunnr = @ls_h-kunnr AND vkorg = @ls_h-vkorg AND vtweg = @ls_h-vtweg AND kdmat = @ls_l-cust_mat.
        IF sy-subrc = 0.
          ls_r-mapped_by = 'CUST. INFO'.
        ENDIF.
      ENDIF.
      IF lv_matnr IS INITIAL AND ls_l-ean IS NOT INITIAL.
        SELECT SINGLE matnr FROM mean INTO @lv_matnr WHERE ean11 = @ls_l-ean.
        IF sy-subrc <> 0.
          SELECT SINGLE matnr FROM mara INTO @lv_matnr WHERE ean11 = @ls_l-ean AND lvorm = ''.
        ENDIF.
        IF lv_matnr IS NOT INITIAL.
          ls_r-mapped_by = 'EAN'.
        ENDIF.
      ENDIF.
      IF lv_matnr IS INITIAL.
        ls_r-mat_ok = 'N'.
        APPEND ls_r TO lt_res.
        CONTINUE.
      ENDIF.
      ls_r-matnr = lv_matnr.
      SELECT SINGLE maktx FROM makt INTO @ls_r-maktx WHERE matnr = @lv_matnr AND spras = @sy-langu.
      SELECT SINGLE meins, mstav FROM mara INTO ( @ls_r-base_uom, @DATA(lv_mstav) ) WHERE matnr = @lv_matnr.
      SELECT SINGLE vmsta, scmng, lvorm FROM mvke INTO ( @DATA(lv_vmsta), @DATA(lv_scmng), @DATA(lv_mvke_del) )
        WHERE matnr = @lv_matnr AND vkorg = @ls_h-vkorg AND vtweg = @ls_h-vtweg.
      IF sy-subrc <> 0 OR lv_mvke_del IS NOT INITIAL.
        ls_r-listed = 'N'.
      ENDIF.
      ls_r-sales_status = COND #( WHEN lv_vmsta IS NOT INITIAL THEN lv_vmsta ELSE lv_mstav ).
      ls_r-round_qty = lv_scmng.
      APPEND ls_r TO lt_res.
      APPEND VALUE #( line = ls_l-line matnr = lv_matnr qty = ls_l-qty uom = ls_l-uom ) TO lt_lines.
      CLEAR: lv_vmsta, lv_scmng, lv_mvke_del, lv_mstav.
    ENDLOOP.
    " price, availability, credit
    IF lv_kunnr_ok = 'X' AND lt_lines IS NOT INITIAL.
      simulate( EXPORTING is_hdr = ls_h it_lines = lt_lines
                IMPORTING et_items = lt_it et_msgs = lt_msgs ev_net = lv_net ev_waerk = lv_waerk ev_credit = lv_credit ).
      LOOP AT lt_res ASSIGNING FIELD-SYMBOL(<r>) WHERE matnr IS NOT INITIAL.
        DATA(lv_pos) = CONV char6( CONV posnr_va( <r>-line ) ).
        READ TABLE lt_it INTO DATA(ls_it) WITH KEY posnr = lv_pos.
        IF sy-subrc = 0.
          <r>-sap_price = ls_it-netpr.
          <r>-atp_qty = ls_it-conf_qty.
          <r>-sap_mrp = ls_it-mrp.
        ENDIF.
        LOOP AT lt_msgs INTO DATA(ls_m) WHERE type = 'E' OR type = 'W'.
          IF ls_m-message CS |{ <r>-line }| OR ls_m-message CS |{ <r>-matnr ALPHA = OUT }|.
            <r>-message = condense( |{ <r>-message } { ls_m-message }| ).
          ENDIF.
        ENDLOOP.
      ENDLOOP.
    ENDIF.
    DATA(lv_hdr) = |\{"KUNNR_OK":"{ lv_kunnr_ok }","NAME1":{ to_json( CONV string( lv_name1 ) ) },"DUPLICATE_SO":"{ lv_dup }","CREDIT_BLOCK":"{ lv_credit }","NET_VALUE":{ lv_net },"CURRENCY":"{ lv_waerk }"\}|.
    rv = |\{"HEADER":{ lv_hdr },"LINES":{ to_json( lt_res ) },"MESSAGES":{ to_json( lt_msgs ) }\}|.
  ENDMETHOD.

  METHOD create_so.
    TYPES: BEGIN OF ty_it, posnr TYPE char6, matnr TYPE matnr, qty TYPE p LENGTH 13 DECIMALS 3, netpr TYPE p LENGTH 13 DECIMALS 2,
             netwr TYPE p LENGTH 15 DECIMALS 2, conf_qty TYPE p LENGTH 13 DECIMALS 3, mrp TYPE p LENGTH 13 DECIMALS 2, END OF ty_it.
    DATA: lt_it TYPE STANDARD TABLE OF ty_it, lt_msgs TYPE ty_msgs, lv_net TYPE netwr, lv_waerk TYPE waerk, lv_credit TYPE char1,
          lt_lines TYPE ty_lines.
    DATA(ls_h) = gs_in-header.
    ls_h-kunnr = |{ ls_h-kunnr ALPHA = IN }|.
    ls_h-kunwe = COND #( WHEN ls_h-kunwe IS NOT INITIAL THEN |{ ls_h-kunwe ALPHA = IN }| ).
    LOOP AT gs_in-items INTO DATA(ls_i).
      APPEND VALUE #( line = CONV i( ls_i-posnr ) matnr = |{ ls_i-matnr ALPHA = IN }| qty = ls_i-qty uom = ls_i-uom cust_mat = ls_i-cust_mat price = ls_i-price ) TO lt_lines.
    ENDLOOP.
    IF lt_lines IS INITIAL.
      rv = |\{"VBELN":"","MESSAGES":[\{"TYPE":"E","MESSAGE":"No items"\}]\}|.
      RETURN.
    ENDIF.
    " never a second order for the same customer + PO number (also protects a retry after a timeout)
    SELECT SINGLE vbeln FROM vbak INTO @DATA(lv_dup) WHERE kunnr = @ls_h-kunnr AND bstnk = @ls_h-bstkd AND vbtyp = 'C'.
    IF sy-subrc = 0.
      rv = |\{"VBELN":"","EXISTING":"{ lv_dup }","MESSAGES":[\{"TYPE":"E","MESSAGE":"Sales order { lv_dup ALPHA = OUT } already exists for PO { ls_h-bstkd }"\}]\}|.
      RETURN.
    ENDIF.
    IF gs_in-testrun = 'X'.
      simulate( EXPORTING is_hdr = ls_h it_lines = lt_lines
                IMPORTING et_items = lt_it et_msgs = lt_msgs ev_net = lv_net ev_waerk = lv_waerk ev_credit = lv_credit ).
      rv = |\{"VBELN":"","NET_VALUE":{ lv_net },"CURRENCY":"{ lv_waerk }","ITEMS":{ to_json( lt_it ) },"MESSAGES":{ to_json( lt_msgs ) }\}|.
      RETURN.
    ENDIF.
    DATA: ls_head TYPE bapisdhd1, lt_items TYPE STANDARD TABLE OF bapisditm, lt_part TYPE STANDARD TABLE OF bapiparnr,
          lt_sched TYPE STANDARD TABLE OF bapischdl, lt_ret TYPE bapiret2_t, lv_vbeln TYPE vbeln_va.
    ls_head-doc_type = COND #( WHEN ls_h-auart IS NOT INITIAL THEN ls_h-auart ELSE default_auart( iv_kunnr = ls_h-kunnr iv_vkorg = ls_h-vkorg ) ).
    ls_head-sales_org = ls_h-vkorg.
    ls_head-distr_chan = ls_h-vtweg.
    ls_head-division = ls_h-spart.
    ls_head-purch_no_c = ls_h-bstkd.
    IF ls_h-bstdk CO '0123456789' AND strlen( ls_h-bstdk ) = 8.
      ls_head-purch_date = ls_h-bstdk.
    ENDIF.
    IF ls_h-vdatu CO '0123456789' AND strlen( ls_h-vdatu ) = 8 AND ls_h-vdatu >= sy-datum.
      ls_head-req_date_h = ls_h-vdatu.
    ENDIF.
    APPEND VALUE #( partn_role = 'AG' partn_numb = ls_h-kunnr ) TO lt_part.
    APPEND VALUE #( partn_role = 'WE' partn_numb = COND #( WHEN ls_h-kunwe IS NOT INITIAL THEN ls_h-kunwe ELSE ls_h-kunnr ) ) TO lt_part.
    LOOP AT lt_lines INTO DATA(ls_l).
      DATA ls_item TYPE bapisditm.
      CLEAR ls_item.
      ls_item-itm_number = ls_l-line.
      ls_item-material = ls_l-matnr.
      set_comp( EXPORTING iv_name = 'SALES_UNIT' iv_value = sales_unit( iv_uom = ls_l-uom iv_matnr = ls_l-matnr iv_vkorg = ls_h-vkorg iv_vtweg = ls_h-vtweg ) CHANGING cs = ls_item ).
      IF ls_l-cust_mat IS NOT INITIAL.
        set_comp( EXPORTING iv_name = 'CUST_MAT35' iv_value = ls_l-cust_mat CHANGING cs = ls_item ).
      ENDIF.
      APPEND ls_item TO lt_items.
      DATA ls_s TYPE bapischdl.
      CLEAR ls_s.
      ls_s-itm_number = ls_l-line.
      ls_s-req_qty = ls_l-qty.
      APPEND ls_s TO lt_sched.
    ENDLOOP.
    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING order_header_in = ls_head
      IMPORTING salesdocument = lv_vbeln
      TABLES return = lt_ret order_items_in = lt_items order_partners = lt_part order_schedules_in = lt_sched.
    add_msgs( EXPORTING it_ret = lt_ret CHANGING ct = lt_msgs ).
    IF lv_vbeln IS INITIAL OR has_error( lt_ret ) = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      rv = |\{"VBELN":"","MESSAGES":{ to_json( lt_msgs ) }\}|.
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
    SELECT SINGLE netwr, waerk FROM vbak INTO ( @lv_net, @lv_waerk ) WHERE vbeln = @lv_vbeln.
    SELECT posnr, matnr, kwmeng AS qty, netpr, netwr FROM vbap INTO CORRESPONDING FIELDS OF TABLE @lt_it WHERE vbeln = @lv_vbeln.
    rv = |\{"VBELN":"{ lv_vbeln }","NET_VALUE":{ lv_net },"CURRENCY":"{ lv_waerk }","ITEMS":{ to_json( lt_it ) },"MESSAGES":{ to_json( lt_msgs ) }\}|.
  ENDMETHOD.

  METHOD list_orders.
    TYPES: BEGIN OF ty_o, vbeln TYPE vbeln_va, erdat TYPE d, auart TYPE auart, kunnr TYPE kunnr, name1 TYPE name1_gp, bstkd TYPE bstnk,
             netwr TYPE netwr_ak, waerk TYPE waerk, vkorg TYPE vkorg, gbstk TYPE char1, lfstk TYPE char1, cmgst TYPE char1, deliv_block TYPE lifsk,
             delivery TYPE vbeln_vl, wbstk TYPE char1, invoice TYPE vbeln_vf, inv_date TYPE char8, END OF ty_o.
    DATA lt TYPE STANDARD TABLE OF ty_o.
    DATA(lv_max) = max_rows( ).
    DATA(lv_from) = date_from( ).
    DATA(lv_to) = date_to( ).
    DATA(lr_kunnr) = r_kunnr( ).
    DATA(lr_vkorg) = r_vkorg( ).
    SELECT a~vbeln, a~erdat, a~auart, a~kunnr, k~name1, a~bstnk AS bstkd, a~netwr, a~waerk, a~vkorg, u~gbstk, u~lfstk, u~cmgst, a~lifsk AS deliv_block
      FROM vbak AS a INNER JOIN vbuk AS u ON u~vbeln = a~vbeln
      LEFT OUTER JOIN kna1 AS k ON k~kunnr = a~kunnr
      WHERE a~vbtyp = 'C' AND a~erdat BETWEEN @lv_from AND @lv_to AND a~kunnr IN @lr_kunnr AND a~vkorg IN @lr_vkorg
      ORDER BY a~erdat DESCENDING, a~vbeln DESCENDING
      INTO CORRESPONDING FIELDS OF TABLE @lt UP TO @lv_max ROWS.
    IF lt IS NOT INITIAL.
      SELECT vbelv, vbeln, vbtyp_n, erdat FROM vbfa INTO TABLE @DATA(lt_f)
        FOR ALL ENTRIES IN @lt WHERE vbelv = @lt-vbeln AND ( vbtyp_n = 'J' OR vbtyp_n = 'M' ).
      SORT lt_f BY vbelv vbtyp_n erdat DESCENDING.
      DATA lt_dl TYPE STANDARD TABLE OF vbeln_vl.
      LOOP AT lt ASSIGNING FIELD-SYMBOL(<o>).
        READ TABLE lt_f INTO DATA(ls_d) WITH KEY vbelv = <o>-vbeln vbtyp_n = 'J' BINARY SEARCH.
        IF sy-subrc = 0.
          <o>-delivery = ls_d-vbeln.
          APPEND ls_d-vbeln TO lt_dl.
        ENDIF.
        READ TABLE lt_f INTO DATA(ls_i) WITH KEY vbelv = <o>-vbeln vbtyp_n = 'M' BINARY SEARCH.
        IF sy-subrc = 0.
          <o>-invoice = ls_i-vbeln.
          <o>-inv_date = ls_i-erdat.
        ENDIF.
      ENDLOOP.
      IF lt_dl IS NOT INITIAL.
        SELECT vbeln, wbstk FROM vbuk INTO TABLE @DATA(lt_w) FOR ALL ENTRIES IN @lt_dl WHERE vbeln = @lt_dl-table_line.
        SORT lt_w BY vbeln.
        LOOP AT lt ASSIGNING <o> WHERE delivery IS NOT INITIAL.
          READ TABLE lt_w INTO DATA(ls_w) WITH KEY vbeln = <o>-delivery BINARY SEARCH.
          IF sy-subrc = 0.
            <o>-wbstk = ls_w-wbstk.
          ENDIF.
        ENDLOOP.
      ENDIF.
    ENDIF.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD list_backorders.
    " Open order lines (not fully delivered, not rejected). Available = unrestricted stock of the plant (MARD-LABST).
    TYPES: BEGIN OF ty_b, vbeln TYPE vbeln_va, posnr TYPE posnr_va, kunnr TYPE kunnr, name1 TYPE name1_gp, matnr TYPE matnr, maktx TYPE arktx,
             order_qty TYPE p LENGTH 13 DECIMALS 3, delivered_qty TYPE p LENGTH 13 DECIMALS 3, open_qty TYPE p LENGTH 13 DECIMALS 3,
             atp_qty TYPE p LENGTH 13 DECIMALS 3, vrkme TYPE vrkme, edatu TYPE char8, werks TYPE werks_d, open_value TYPE p LENGTH 15 DECIMALS 2,
             deliv_block TYPE lifsk, netwr TYPE netwr_ap, END OF ty_b.
    DATA lt TYPE STANDARD TABLE OF ty_b.
    DATA(lv_max) = max_rows( ).
    DATA(lv_from) = date_from( ).
    DATA(lv_to) = date_to( ).
    DATA(lr_kunnr) = r_kunnr( ).
    DATA(lr_vkorg) = r_vkorg( ).
    SELECT p~vbeln, p~posnr, a~kunnr, k~name1, p~matnr, p~arktx AS maktx, p~kwmeng AS order_qty, p~vrkme, p~werks, a~lifsk AS deliv_block, p~netwr
      FROM vbap AS p INNER JOIN vbak AS a ON a~vbeln = p~vbeln
      INNER JOIN vbup AS u ON u~vbeln = p~vbeln AND u~posnr = p~posnr
      LEFT OUTER JOIN kna1 AS k ON k~kunnr = a~kunnr
      WHERE a~vbtyp = 'C' AND a~erdat BETWEEN @lv_from AND @lv_to AND p~abgru = '' AND ( u~lfsta = 'A' OR u~lfsta = 'B' )
        AND a~kunnr IN @lr_kunnr AND a~vkorg IN @lr_vkorg
      ORDER BY p~vbeln, p~posnr
      INTO CORRESPONDING FIELDS OF TABLE @lt UP TO @lv_max ROWS.
    IF lt IS NOT INITIAL.
      SELECT vbelv, posnv, rfmng FROM vbfa INTO TABLE @DATA(lt_f) FOR ALL ENTRIES IN @lt
        WHERE vbelv = @lt-vbeln AND posnv = @lt-posnr AND vbtyp_n = 'J'.
      SELECT vbeln, posnr, edatu FROM vbep INTO TABLE @DATA(lt_e) FOR ALL ENTRIES IN @lt WHERE vbeln = @lt-vbeln AND posnr = @lt-posnr.
      SORT lt_e BY vbeln posnr edatu.
      SELECT matnr, werks, lgort, labst FROM mard INTO TABLE @DATA(lt_sl) FOR ALL ENTRIES IN @lt
        WHERE matnr = @lt-matnr AND werks = @lt-werks.
      TYPES: BEGIN OF ty_st, matnr TYPE matnr, werks TYPE werks_d, labst TYPE p LENGTH 15 DECIMALS 3, END OF ty_st.
      DATA lt_s TYPE SORTED TABLE OF ty_st WITH UNIQUE KEY matnr werks.
      LOOP AT lt_sl INTO DATA(ls_sl).
        COLLECT VALUE ty_st( matnr = ls_sl-matnr werks = ls_sl-werks labst = ls_sl-labst ) INTO lt_s.
      ENDLOOP.
      LOOP AT lt ASSIGNING FIELD-SYMBOL(<b>).
        LOOP AT lt_f INTO DATA(ls_f) WHERE vbelv = <b>-vbeln AND posnv = <b>-posnr.
          <b>-delivered_qty = <b>-delivered_qty + ls_f-rfmng.
        ENDLOOP.
        <b>-open_qty = nmax( val1 = 0 val2 = <b>-order_qty - <b>-delivered_qty ).
        IF <b>-order_qty > 0.
          <b>-open_value = <b>-netwr * <b>-open_qty / <b>-order_qty.
        ENDIF.
        READ TABLE lt_e INTO DATA(ls_e) WITH KEY vbeln = <b>-vbeln posnr = <b>-posnr BINARY SEARCH.
        IF sy-subrc = 0.
          <b>-edatu = ls_e-edatu.
        ENDIF.
        READ TABLE lt_s INTO DATA(ls_s) WITH TABLE KEY matnr = <b>-matnr werks = <b>-werks.
        IF sy-subrc = 0.
          <b>-atp_qty = ls_s-labst.
        ENDIF.
      ENDLOOP.
      DELETE lt WHERE open_qty <= 0.
    ENDIF.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD create_delivery.
    DATA: lt_items TYPE STANDARD TABLE OF bapidlvreftosalesorder, lt_dlv TYPE STANDARD TABLE OF bapishpdelivnumb, lt_ret TYPE bapiret2_t, lt_msgs TYPE ty_msgs.
    LOOP AT gs_in-dlv_items INTO DATA(ls_i) WHERE qty > 0.
      DATA ls_r TYPE bapidlvreftosalesorder.
      CLEAR ls_r.
      ls_r-ref_doc = |{ ls_i-vbeln ALPHA = IN }|.
      ls_r-ref_item = ls_i-posnr.
      ls_r-dlv_qty = ls_i-qty.
      SELECT SINGLE vrkme FROM vbap INTO @ls_r-sales_unit WHERE vbeln = @ls_r-ref_doc AND posnr = @ls_r-ref_item.
      APPEND ls_r TO lt_items.
    ENDLOOP.
    IF lt_items IS INITIAL.
      rv = |\{"DELIVERIES":[],"MESSAGES":[\{"TYPE":"E","MESSAGE":"No lines to deliver"\}]\}|.
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_SLS'
      TABLES sales_order_items = lt_items deliveries = lt_dlv return = lt_ret.
    add_msgs( EXPORTING it_ret = lt_ret CHANGING ct = lt_msgs ).
    IF lt_dlv IS NOT INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ENDIF.
    TYPES: BEGIN OF ty_d, vbeln TYPE vbeln_vl, END OF ty_d.
    DATA lt_out TYPE STANDARD TABLE OF ty_d.
    LOOP AT lt_dlv INTO DATA(ls_d).
      APPEND VALUE #( vbeln = ls_d-deliv_numb ) TO lt_out.
    ENDLOOP.
    rv = |\{"DELIVERIES":{ to_json( lt_out ) },"MESSAGES":{ to_json( lt_msgs ) }\}|.
  ENDMETHOD.

  METHOD list_deliveries.
    TYPES: BEGIN OF ty_d, vbeln TYPE vbeln_vl, lfdat TYPE d, wadat_ist TYPE d, kunnr TYPE kunnr, name1 TYPE name1_gp, ort01 TYPE ort01_gp,
             wbstk TYPE char1, sales_order TYPE vbeln_va, bstkd TYPE bstnk, items TYPE i, total_qty TYPE p LENGTH 15 DECIMALS 3, invoice TYPE vbeln_vf,
             truck TYPE char20, lr_no TYPE char20, END OF ty_d.
    DATA lt TYPE STANDARD TABLE OF ty_d.
    DATA(lv_max) = max_rows( ).
    DATA(lv_from) = date_from( ).
    DATA(lv_to) = date_to( ).
    DATA(lr_kunnr) = r_kunnr( ).
    DATA(lr_vkorg) = r_vkorg( ).
    DATA lr_wbstk TYPE RANGE OF wbstk.
    IF gs_in-pgi_done = 'X'.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = 'C' ) TO lr_wbstk.
    ENDIF.
    SELECT l~vbeln, l~lfdat, l~wadat_ist, l~kunnr, k~name1, k~ort01, u~wbstk
      FROM likp AS l INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
      LEFT OUTER JOIN kna1 AS k ON k~kunnr = l~kunnr
      WHERE l~vbtyp = 'J' AND l~erdat BETWEEN @lv_from AND @lv_to
        AND l~kunnr IN @lr_kunnr AND l~vkorg IN @lr_vkorg AND u~wbstk IN @lr_wbstk
      ORDER BY l~vbeln DESCENDING
      INTO CORRESPONDING FIELDS OF TABLE @lt UP TO @lv_max ROWS.
    IF lt IS NOT INITIAL.
      SELECT vbeln, vgbel, lfimg FROM lips INTO TABLE @DATA(lt_p) FOR ALL ENTRIES IN @lt WHERE vbeln = @lt-vbeln.
      SELECT vbelv, vbeln FROM vbfa INTO TABLE @DATA(lt_f) FOR ALL ENTRIES IN @lt WHERE vbelv = @lt-vbeln AND vbtyp_n = 'M'.
      SORT lt_f BY vbelv.
      LOOP AT lt ASSIGNING FIELD-SYMBOL(<d>).
        LOOP AT lt_p INTO DATA(ls_p) WHERE vbeln = <d>-vbeln.
          <d>-items = <d>-items + 1.
          <d>-total_qty = <d>-total_qty + ls_p-lfimg.
          IF <d>-sales_order IS INITIAL.
            <d>-sales_order = ls_p-vgbel.
          ENDIF.
        ENDLOOP.
        IF <d>-sales_order IS NOT INITIAL.
          SELECT SINGLE bstnk FROM vbak INTO @<d>-bstkd WHERE vbeln = @<d>-sales_order.
        ENDIF.
        READ TABLE lt_f INTO DATA(ls_f) WITH KEY vbelv = <d>-vbeln BINARY SEARCH.
        IF sy-subrc = 0.
          <d>-invoice = ls_f-vbeln.
        ENDIF.
      ENDLOOP.
    ENDIF.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD delivery_items.
    TYPES: BEGIN OF ty_i, vbeln TYPE vbeln_vl, posnr TYPE posnr_vl, matnr TYPE matnr, maktx TYPE arktx, kdmat TYPE kdmat, ean11 TYPE ean11,
             lfimg TYPE p LENGTH 13 DECIMALS 3, vrkme TYPE vrkme, charg TYPE charg_d, hsdat TYPE char8, vfdat TYPE char8, mrp TYPE char1, END OF ty_i.
    DATA lt TYPE STANDARD TABLE OF ty_i.
    DATA lt_v TYPE STANDARD TABLE OF vbeln_vl.
    LOOP AT gs_in-vbelns INTO DATA(lv_v).
      APPEND CONV vbeln_vl( |{ lv_v ALPHA = IN }| ) TO lt_v.
    ENDLOOP.
    IF lt_v IS INITIAL.
      rv = rows_json( rows = lt iv_max = 1 ).
      RETURN.
    ENDIF.
    SELECT p~vbeln, p~posnr, p~matnr, p~arktx AS maktx, p~kdmat, m~ean11, p~lfimg, p~vrkme, p~charg
      FROM lips AS p LEFT OUTER JOIN mara AS m ON m~matnr = p~matnr
      FOR ALL ENTRIES IN @lt_v WHERE p~vbeln = @lt_v-table_line AND p~lfimg > 0
      INTO CORRESPONDING FIELDS OF TABLE @lt.
    LOOP AT lt ASSIGNING FIELD-SYMBOL(<i>) WHERE charg IS NOT INITIAL.
      SELECT SINGLE hsdat, vfdat FROM mch1 INTO ( @DATA(lv_h), @DATA(lv_e) ) WHERE matnr = @<i>-matnr AND charg = @<i>-charg.
      IF sy-subrc = 0.
        <i>-hsdat = ymd( lv_h ).
        <i>-vfdat = ymd( lv_e ).
      ENDIF.
    ENDLOOP.
    SORT lt BY vbeln posnr.
    rv = rows_json( rows = lt iv_max = 100000 ).
  ENDMETHOD.

  METHOD list_invoices.
    TYPES: BEGIN OF ty_v, vbeln TYPE vbeln_vf, fkdat TYPE d, fkart TYPE fkart, kunrg TYPE kunrg, name1 TYPE name1_gp, netwr TYPE netwr,
             mwsbk TYPE mwsbp, waerk TYPE waerk, xblnr TYPE xblnr_v1, bukrs TYPE bukrs, bstkd TYPE bstnk, due_date TYPE char8,
             open_amount TYPE p LENGTH 15 DECIMALS 2, augdt TYPE char8, augbl TYPE augbl, END OF ty_v.
    DATA lt TYPE STANDARD TABLE OF ty_v.
    DATA(lv_max) = max_rows( ).
    DATA(lv_from) = date_from( ).
    DATA(lv_to) = date_to( ).
    DATA(lr_kunnr) = r_kunnr( ).
    DATA(lr_vkorg) = r_vkorg( ).
    SELECT r~vbeln, r~fkdat, r~fkart, r~kunrg, k~name1, r~netwr, r~mwsbk, r~waerk, r~xblnr, r~bukrs
      FROM vbrk AS r LEFT OUTER JOIN kna1 AS k ON k~kunnr = r~kunrg
      WHERE r~vbtyp = 'M' AND r~fksto = '' AND r~fkdat BETWEEN @lv_from AND @lv_to
        AND r~kunrg IN @lr_kunnr AND r~vkorg IN @lr_vkorg
      ORDER BY r~fkdat DESCENDING, r~vbeln DESCENDING
      INTO CORRESPONDING FIELDS OF TABLE @lt UP TO @lv_max ROWS.
    IF lt IS NOT INITIAL.
      SELECT bukrs, kunnr, vbeln, shkzg, dmbtr, zfbdt, zbd1t, zbd2t, zbd3t FROM bsid INTO TABLE @DATA(lt_o)
        FOR ALL ENTRIES IN @lt WHERE bukrs = @lt-bukrs AND kunnr = @lt-kunrg AND vbeln = @lt-vbeln.
      SELECT bukrs, kunnr, vbeln, augdt, augbl, zfbdt, zbd1t FROM bsad INTO TABLE @DATA(lt_c)
        FOR ALL ENTRIES IN @lt WHERE bukrs = @lt-bukrs AND kunnr = @lt-kunrg AND vbeln = @lt-vbeln.
      SELECT p~vbeln, a~bstnk FROM vbrp AS p INNER JOIN vbak AS a ON a~vbeln = p~aubel
        FOR ALL ENTRIES IN @lt WHERE p~vbeln = @lt-vbeln INTO TABLE @DATA(lt_po).
      SORT lt_po BY vbeln.
      LOOP AT lt ASSIGNING FIELD-SYMBOL(<v>).
        LOOP AT lt_o INTO DATA(ls_o) WHERE vbeln = <v>-vbeln.
          <v>-open_amount = <v>-open_amount + COND #( WHEN ls_o-shkzg = 'S' THEN ls_o-dmbtr ELSE 0 - ls_o-dmbtr ).
          DATA(lv_due) = CONV d( ls_o-zfbdt + nmax( val1 = ls_o-zbd1t val2 = nmax( val1 = ls_o-zbd2t val2 = ls_o-zbd3t ) ) ).
          IF ls_o-zbd1t > 0.
            lv_due = ls_o-zfbdt + ls_o-zbd1t.
          ENDIF.
          <v>-due_date = ymd( lv_due ).
        ENDLOOP.
        IF <v>-due_date IS INITIAL.
          LOOP AT lt_c INTO DATA(ls_c) WHERE vbeln = <v>-vbeln.
            <v>-augdt = ymd( ls_c-augdt ).
            <v>-augbl = ls_c-augbl.
            <v>-due_date = ymd( CONV d( ls_c-zfbdt + ls_c-zbd1t ) ).
          ENDLOOP.
        ENDIF.
        READ TABLE lt_po INTO DATA(ls_po) WITH KEY vbeln = <v>-vbeln BINARY SEARCH.
        IF sy-subrc = 0.
          <v>-bstkd = ls_po-bstnk.
        ENDIF.
      ENDLOOP.
    ENDIF.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD invoice_items.
    TYPES: BEGIN OF ty_i, vbeln TYPE vbeln_vf, posnr TYPE posnr_vf, matnr TYPE matnr, maktx TYPE arktx, ean11 TYPE ean11, kdmat TYPE matnr_ku,
             fkimg TYPE p LENGTH 13 DECIMALS 3, vrkme TYPE vrkme, netwr TYPE p LENGTH 15 DECIMALS 2, netpr TYPE p LENGTH 13 DECIMALS 2,
             aubel TYPE vbeln_va, aupos TYPE posnr_va, END OF ty_i.
    DATA lt TYPE STANDARD TABLE OF ty_i.
    DATA lt_v TYPE STANDARD TABLE OF vbeln_vf.
    LOOP AT gs_in-vbelns INTO DATA(lv_v).
      APPEND CONV vbeln_vf( |{ lv_v ALPHA = IN }| ) TO lt_v.
    ENDLOOP.
    IF lt_v IS INITIAL.
      rv = rows_json( rows = lt iv_max = 1 ).
      RETURN.
    ENDIF.
    SELECT p~vbeln, p~posnr, p~matnr, p~arktx AS maktx, m~ean11, p~fkimg, p~vrkme, p~netwr, p~aubel, p~aupos
      FROM vbrp AS p LEFT OUTER JOIN mara AS m ON m~matnr = p~matnr
      FOR ALL ENTRIES IN @lt_v WHERE p~vbeln = @lt_v-table_line
      INTO CORRESPONDING FIELDS OF TABLE @lt.
    IF lt IS NOT INITIAL.
      SELECT vbeln, posnr, kdmat FROM vbap INTO TABLE @DATA(lt_k) FOR ALL ENTRIES IN @lt WHERE vbeln = @lt-aubel AND posnr = @lt-aupos.
      SORT lt_k BY vbeln posnr.
      LOOP AT lt ASSIGNING FIELD-SYMBOL(<i>).
        IF <i>-fkimg > 0.
          <i>-netpr = <i>-netwr / <i>-fkimg.
        ENDIF.
        READ TABLE lt_k INTO DATA(ls_k) WITH KEY vbeln = <i>-aubel posnr = <i>-aupos BINARY SEARCH.
        IF sy-subrc = 0.
          <i>-kdmat = ls_k-kdmat.
        ENDIF.
      ENDLOOP.
    ENDIF.
    rv = rows_json( rows = lt iv_max = 100000 ).
  ENDMETHOD.

  METHOD list_open_items.
    TYPES: BEGIN OF ty_o, belnr TYPE belnr_d, gjahr TYPE gjahr, buzei TYPE buzei, bukrs TYPE bukrs, kunnr TYPE kunnr, name1 TYPE name1_gp,
             xblnr TYPE xblnr1, vbeln TYPE vbeln_vf, bldat TYPE char8, due TYPE char8, dmbtr TYPE p LENGTH 15 DECIMALS 2, blart TYPE blart, sgtxt TYPE sgtxt, END OF ty_o.
    DATA lt TYPE STANDARD TABLE OF ty_o.
    DATA lt_k TYPE RANGE OF kunnr.
    DATA(lv_max) = max_rows( ).
    LOOP AT gs_in-kunnrs INTO DATA(lv_k).
      APPEND VALUE #( sign = 'I' option = 'EQ' low = |{ lv_k ALPHA = IN }| ) TO lt_k.
    ENDLOOP.
    SELECT b~belnr, b~gjahr, b~buzei, b~bukrs, b~kunnr, k~name1, b~xblnr, b~vbeln, b~bldat, b~dmbtr, b~blart, b~sgtxt, b~zfbdt, b~zbd1t
      FROM bsid AS b LEFT OUTER JOIN kna1 AS k ON k~kunnr = b~kunnr
      WHERE b~kunnr IN @lt_k AND b~shkzg = 'S' AND b~umskz = ''
      ORDER BY b~kunnr, b~bldat DESCENDING
      INTO TABLE @DATA(lt_b) UP TO @lv_max ROWS.
    LOOP AT lt_b INTO DATA(ls_b).
      APPEND VALUE #( belnr = ls_b-belnr gjahr = ls_b-gjahr buzei = ls_b-buzei bukrs = ls_b-bukrs kunnr = ls_b-kunnr name1 = ls_b-name1
                      xblnr = ls_b-xblnr vbeln = ls_b-vbeln bldat = ymd( ls_b-bldat ) due = ymd( CONV d( ls_b-zfbdt + ls_b-zbd1t ) )
                      dmbtr = ls_b-dmbtr blart = ls_b-blart sgtxt = ls_b-sgtxt ) TO lt.
    ENDLOOP.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

  METHOD list_deductions.
    " Short payments: open debit items that are residuals of a payment (REBZG set). Debit notes: customer credit memos
    " (billing type category O) with the order reason of the credit memo request as the reason text.
    TYPES: BEGIN OF ty_d, kind TYPE char12, belnr TYPE char10, gjahr TYPE gjahr, buzei TYPE buzei, kunnr TYPE kunnr, name1 TYPE name1_gp,
             bldat TYPE char8, dmbtr TYPE p LENGTH 15 DECIMALS 2, rebzg TYPE char10, sgtxt TYPE string, reason TYPE string, END OF ty_d.
    DATA lt TYPE STANDARD TABLE OF ty_d.
    DATA(lv_max) = max_rows( ).
    DATA(lv_from) = date_from( ).
    DATA(lv_to) = date_to( ).
    DATA(lr_kunnr) = r_kunnr( ).
    DATA(lr_vkorg) = r_vkorg( ).
    SELECT b~belnr, b~gjahr, b~buzei, b~kunnr, k~name1, b~bldat, b~dmbtr, b~rebzg, b~sgtxt
      FROM bsid AS b LEFT OUTER JOIN kna1 AS k ON k~kunnr = b~kunnr
      WHERE b~rebzg <> '' AND b~shkzg = 'S' AND b~umskz = '' AND b~bldat BETWEEN @lv_from AND @lv_to AND b~kunnr IN @lr_kunnr
      INTO TABLE @DATA(lt_r) UP TO @lv_max ROWS.
    LOOP AT lt_r INTO DATA(ls_r).
      APPEND VALUE #( kind = 'RESIDUAL' belnr = ls_r-belnr gjahr = ls_r-gjahr buzei = ls_r-buzei kunnr = ls_r-kunnr name1 = ls_r-name1
                      bldat = ymd( ls_r-bldat ) dmbtr = ls_r-dmbtr rebzg = ls_r-rebzg sgtxt = ls_r-sgtxt ) TO lt.
    ENDLOOP.
    SELECT r~vbeln, r~fkdat, r~kunrg, k~name1, r~netwr, r~mwsbk, r~xblnr
      FROM vbrk AS r LEFT OUTER JOIN kna1 AS k ON k~kunnr = r~kunrg
      WHERE r~vbtyp = 'O' AND r~fksto = '' AND r~fkdat BETWEEN @lv_from AND @lv_to AND r~kunrg IN @lr_kunnr AND r~vkorg IN @lr_vkorg
      INTO TABLE @DATA(lt_c) UP TO @lv_max ROWS.
    LOOP AT lt_c INTO DATA(ls_c).
      DATA(ls_d) = VALUE ty_d( kind = 'CREDIT_MEMO' belnr = ls_c-vbeln kunnr = ls_c-kunrg name1 = ls_c-name1 bldat = ymd( ls_c-fkdat )
                               dmbtr = ls_c-netwr + ls_c-mwsbk sgtxt = ls_c-xblnr ).
      SELECT SINGLE a~augru, t~bezei, p~vgbel FROM vbrp AS p INNER JOIN vbak AS a ON a~vbeln = p~aubel
        LEFT OUTER JOIN tvaut AS t ON t~augru = a~augru AND t~spras = @sy-langu
        WHERE p~vbeln = @ls_c-vbeln INTO @DATA(ls_a).
      IF sy-subrc = 0.
        ls_d-reason = ls_a-bezei.
        ls_d-rebzg = ls_a-vgbel.
      ENDIF.
      APPEND ls_d TO lt.
      CLEAR ls_a.
    ENDLOOP.
    SORT lt BY bldat DESCENDING.
    rv = rows_json( rows = lt iv_max = lv_max ).
  ENDMETHOD.

ENDCLASS.
