"! Data provider of OData service ZTMS_SRV (code based, no SEGW project): maps requests to ZCL_TMS_CORE. Reads: VendorSet, CustomerSet,
"! PoSoCheckSet, PaymentStatusSet, OutDeliverySet, OutShipmentSet, LaneSet (freight condition ZB00 via CDS ZI_TMS_LANERATE), FreightCondSet (A964 + transporter + route text via CDS ZI_TMS_A964_VENDOR),
"! TripInvoiceSet + ParallelCheckSet (Instavans/ZSMART_VEH replacement, read) and POST TripVehicleSet (writes ZTMS_TRIP_VEH/INV). The only write is POST FreightInvoiceSet (the gateway hub passes no function imports / PUT / DELETE).
"! The hub login e-mail arrives as option emamiuser= or header X-Emami-User and is written into the FI item text for traceability.
CLASS zcl_ztms_dpc DEFINITION PUBLIC INHERITING FROM /iwbep/cl_mgw_abs_data CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_entity REDEFINITION.
  PROTECTED SECTION.
    METHODS busi
      IMPORTING iv_text TYPE string iv_status TYPE /iwbep/mgw_http_status_code DEFAULT '400'
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS key_value
      IMPORTING it_key TYPE /iwbep/t_mgw_name_value_pair iv_name TYPE string RETURNING VALUE(rv_val) TYPE string.
    METHODS filter_values
      IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_name TYPE string RETURNING VALUE(rt_val) TYPE string_table.
    METHODS hub_user RETURNING VALUE(rv_user) TYPE string.
    "! Distribution Planning sets: a filter is mandatory (the aggregates scan big tables), $top at most 5000, $skip / $top applied after a stable sort.
    METHODS dp_guard
      IMPORTING iv_filtered TYPE abap_bool iv_what TYPE string is_paging TYPE /iwbep/s_mgw_paging
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS dp_page
      IMPORTING is_paging TYPE /iwbep/s_mgw_paging CHANGING ct_tab TYPE STANDARD TABLE.
    "! Date range of a filter on property iv_name (Edm.DateTime arrives as YYYYMMDD or ISO text): from / to, initial = open.
    METHODS dp_dates
      IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_name TYPE string
      EXPORTING ev_from TYPE d ev_to TYPE d.
ENDCLASS.

CLASS zcl_ztms_dpc IMPLEMENTATION.

  METHOD busi.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error_unlimited message_unlimited = iv_text http_status_code = iv_status.
  ENDMETHOD.

  METHOD key_value.
    LOOP AT it_key INTO DATA(ls_k).
      IF to_upper( ls_k-name ) = to_upper( iv_name ).
        rv_val = ls_k-value.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD filter_values.
    LOOP AT it_filter INTO DATA(ls_f).
      IF to_upper( ls_f-property ) = to_upper( iv_name ).
        LOOP AT ls_f-select_options INTO DATA(ls_o) WHERE sign = 'I' AND option = 'EQ'.
          APPEND ls_o-low TO rt_val.
        ENDLOOP.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD dp_guard.
    IF iv_filtered <> abap_true.
      busi( |Give a filter ({ iv_what }) - the planning feed does not read the whole system.| ).
    ENDIF.
    IF is_paging-top > 5000.
      busi( `At most 5000 rows per request ($top).` ).
    ENDIF.
  ENDMETHOD.

  METHOD dp_page.
    IF is_paging-skip > 0.
      DELETE ct_tab TO is_paging-skip.
    ENDIF.
    IF is_paging-top > 0 AND lines( ct_tab ) > is_paging-top.
      DELETE ct_tab FROM is_paging-top + 1.
    ENDIF.
  ENDMETHOD.

  METHOD dp_dates.
    CLEAR: ev_from, ev_to.
    LOOP AT it_filter INTO DATA(ls_f).
      IF to_upper( ls_f-property ) <> to_upper( iv_name ).
        CONTINUE.
      ENDIF.
      LOOP AT ls_f-select_options INTO DATA(ls_o) WHERE sign = 'I'.
        DATA(lv_lo) = ls_o-low.
        DATA(lv_hi) = ls_o-high.
        REPLACE ALL OCCURRENCES OF REGEX '[^0-9]' IN lv_lo WITH ''.
        REPLACE ALL OCCURRENCES OF REGEX '[^0-9]' IN lv_hi WITH ''.
        DATA(lv_d1) = COND d( WHEN strlen( lv_lo ) >= 8 THEN lv_lo(8) ).
        DATA(lv_d2) = COND d( WHEN strlen( lv_hi ) >= 8 THEN lv_hi(8) ).
        CASE ls_o-option.
          WHEN 'EQ'.
            ev_from = lv_d1. ev_to = lv_d1.
          WHEN 'GE' OR 'GT'.
            ev_from = lv_d1.
          WHEN 'LE' OR 'LT'.
            ev_to = lv_d1.
          WHEN 'BT'.
            ev_from = lv_d1. ev_to = lv_d2.
        ENDCASE.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD hub_user.
    IF mr_request_details IS NOT BOUND.
      RETURN.
    ENDIF.
    LOOP AT mr_request_details->*-technical_request-request_header INTO DATA(ls_h).
      IF to_lower( ls_h-name ) = '~request_uri'.
        FIND REGEX '[?&]emamiuser=([^&]*)' IN ls_h-value IGNORING CASE SUBMATCHES DATA(lv_mail).
        IF sy-subrc = 0.
          rv_user = cl_http_utility=>unescape_url( lv_mail ).
        ENDIF.
      ELSEIF to_lower( ls_h-name ) = 'x-emami-user' AND ls_h-value IS NOT INITIAL.
        rv_user = ls_h-value.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    CASE iv_entity_set_name.
      WHEN 'VendorSet'.
        DATA(lt_l) = filter_values( it_filter = it_filter_select_options iv_name = 'Lifnr' ).
        DATA(lt_v) = zcl_tms_core=>get_vendors( iv_lifnr = COND #( WHEN lines( lt_l ) = 1 THEN |{ lt_l[ 1 ] ALPHA = IN }| ) ).
        copy_data_to_ref( EXPORTING is_data = lt_v CHANGING cr_data = er_entityset ).
      WHEN 'CustomerSet'.
        DATA(lt_k) = filter_values( it_filter = it_filter_select_options iv_name = 'Kunnr' ).
        DATA(lt_c) = zcl_tms_core=>get_customers( iv_kunnr = COND #( WHEN lines( lt_k ) = 1 THEN |{ lt_k[ 1 ] ALPHA = IN }| ) ).
        copy_data_to_ref( EXPORTING is_data = lt_c CHANGING cr_data = er_entityset ).
      WHEN 'PoSoCheckSet'.
        DATA(lt_po) = filter_values( it_filter = it_filter_select_options iv_name = 'Po' ).
        DATA(lt_so) = filter_values( it_filter = it_filter_select_options iv_name = 'So' ).
        DATA(lv_po) = COND string( WHEN lt_po IS NOT INITIAL THEN lt_po[ 1 ] ).
        DATA(lv_so) = COND string( WHEN lt_so IS NOT INITIAL THEN lt_so[ 1 ] ).
        DATA(lt_chk) = VALUE zcl_tms_ty=>tt_posocheck( ( zcl_tms_core=>check_poso( iv_po = lv_po iv_so = lv_so ) ) ).
        copy_data_to_ref( EXPORTING is_data = lt_chk CHANGING cr_data = er_entityset ).
      WHEN 'PaymentStatusSet'.
        DATA(lt_b) = filter_values( it_filter = it_filter_select_options iv_name = 'Belnr' ).
        IF lt_b IS INITIAL.
          busi( `Filter Belnr eq '<document>' is mandatory.` ).
        ENDIF.
        IF lines( lt_b ) > 50.
          busi( `At most 50 documents per request.` ).
        ENDIF.
        DATA lt_ps TYPE zcl_tms_ty=>tt_paymentstatus.
        LOOP AT lt_b INTO DATA(lv_b).
          APPEND zcl_tms_core=>payment_status( CONV #( |{ lv_b ALPHA = IN }| ) ) TO lt_ps.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_ps CHANGING cr_data = er_entityset ).
      WHEN 'OutDeliverySet'.
        DATA(lt_vb) = filter_values( it_filter = it_filter_select_options iv_name = 'Vbeln' ).
        IF lt_vb IS INITIAL.
          busi( `Filter Vbeln eq '<delivery>' is mandatory.` ).
        ENDIF.
        IF lines( lt_vb ) > 50.
          busi( `At most 50 deliveries per request.` ).
        ENDIF.
        DATA(lt_od) = zcl_tms_core=>get_out_deliveries( lt_vb ).
        copy_data_to_ref( EXPORTING is_data = lt_od CHANGING cr_data = er_entityset ).
      WHEN 'OutShipmentSet'.
        DATA(lt_tk) = filter_values( it_filter = it_filter_select_options iv_name = 'Tknum' ).
        IF lines( lt_tk ) <> 1.
          busi( `Filter Tknum eq '<shipment>' is mandatory (one shipment).` ).
        ENDIF.
        DATA(ls_os) = zcl_tms_core=>get_out_shipment( CONV #( |{ lt_tk[ 1 ] ALPHA = IN }| ) ).
        DATA(lt_os) = VALUE zcl_tms_ty=>tt_outshipment( ).
        IF ls_os-tknum IS NOT INITIAL.
          APPEND ls_os TO lt_os.
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_os CHANGING cr_data = er_entityset ).
      WHEN 'LaneSet'.
        " Lane freight = condition ZB00 records valid today (CDS ZI_TMS_LANERATE). Optional filters Route, Lifnr, Vsart, VehicleType; $top/$skip honoured.
        DATA(lt_ln) = zcl_tms_core=>get_lanes(
          it_route   = filter_values( it_filter = it_filter_select_options iv_name = 'Route' )
          it_lifnr   = filter_values( it_filter = it_filter_select_options iv_name = 'Lifnr' )
          it_vsart   = filter_values( it_filter = it_filter_select_options iv_name = 'Vsart' )
          it_vehicle = filter_values( it_filter = it_filter_select_options iv_name = 'VehicleType' ) ).
        IF is_paging-skip > 0.
          DELETE lt_ln TO is_paging-skip.
        ENDIF.
        IF is_paging-top > 0 AND lines( lt_ln ) > is_paging-top.
          DELETE lt_ln FROM is_paging-top + 1.
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_ln CHANGING cr_data = er_entityset ).
      WHEN 'FreightCondSet'.
        " A964 freight conditions with transporter and route text. Filters (all optional, EQ): Route, Tdlnr, Kschl, Vsart, Shtyp, Add01.
        " Without any filter $top is required (the table has ~20,000 rows); $top / $skip page the result.
        DATA(lt_fr) = filter_values( it_filter = it_filter_select_options iv_name = 'Route' ).
        DATA(lt_ft) = filter_values( it_filter = it_filter_select_options iv_name = 'Tdlnr' ).
        DATA(lt_fk) = filter_values( it_filter = it_filter_select_options iv_name = 'Kschl' ).
        DATA(lt_fv) = filter_values( it_filter = it_filter_select_options iv_name = 'Vsart' ).
        DATA(lt_fs) = filter_values( it_filter = it_filter_select_options iv_name = 'Shtyp' ).
        DATA(lt_fa) = filter_values( it_filter = it_filter_select_options iv_name = 'Add01' ).
        IF lt_fr IS INITIAL AND lt_ft IS INITIAL AND lt_fk IS INITIAL AND lt_fv IS INITIAL AND lt_fs IS INITIAL AND lt_fa IS INITIAL AND is_paging-top = 0.
          busi( `Give a filter (Route, Tdlnr, Kschl, Vsart, Shtyp or Add01 eq '...') or $top: the table is too large to read in one go.` ).
        ENDIF.
        IF is_paging-top > 5000.
          busi( `At most 5000 rows per request ($top).` ).
        ENDIF.
        DATA(lt_fc) = zcl_tms_core=>get_freight_cond( it_route = lt_fr it_tdlnr = lt_ft it_kschl = lt_fk it_vsart = lt_fv it_shtyp = lt_fs it_add01 = lt_fa
                                                     iv_skip = is_paging-skip iv_top = COND #( WHEN is_paging-top > 0 THEN is_paging-top ELSE 5000 ) ).
        copy_data_to_ref( EXPORTING is_data = lt_fc CHANGING cr_data = er_entityset ).
      WHEN 'DpMaterialSet'.
        " Filters (EQ): Spart, Matnr (one or many). Or $top (max 5000) with $skip to page the whole master.
        DATA(lt_dm_s) = filter_values( it_filter = it_filter_select_options iv_name = 'Spart' ).
        DATA(lt_dm_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        IF lt_dm_s IS INITIAL AND lt_dm_m IS INITIAL AND is_paging-top = 0.
          busi( `Give a filter (Spart or Matnr eq '...') or $top.` ).
        ENDIF.
        dp_guard( iv_filtered = abap_true iv_what = `` is_paging = is_paging ).
        DATA(lt_dm) = zcl_tms_dp=>get_materials( it_spart = lt_dm_s it_matnr = lt_dm_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_dm ).
        copy_data_to_ref( EXPORTING is_data = lt_dm CHANGING cr_data = er_entityset ).
      WHEN 'DpStockSet'.
        DATA(lt_ds_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_ds_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = xsdbool( lt_ds_w IS NOT INITIAL OR lt_ds_m IS NOT INITIAL ) iv_what = `Werks or Matnr eq '...'` is_paging = is_paging ).
        DATA(lt_ds) = zcl_tms_dp=>get_stock( it_werks = lt_ds_w it_matnr = lt_ds_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_ds ).
        copy_data_to_ref( EXPORTING is_data = lt_ds CHANGING cr_data = er_entityset ).
      WHEN 'DpLotSet'.
        DATA(lt_dl_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_dl_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = xsdbool( lt_dl_w IS NOT INITIAL OR lt_dl_m IS NOT INITIAL ) iv_what = `Werks or Matnr eq '...'` is_paging = is_paging ).
        DATA(lt_dl) = zcl_tms_dp=>get_lots( it_werks = lt_dl_w it_matnr = lt_dl_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_dl ).
        copy_data_to_ref( EXPORTING is_data = lt_dl CHANGING cr_data = er_entityset ).
      WHEN 'DpStoSet'.
        DATA(lt_dt_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_dt_r) = filter_values( it_filter = it_filter_select_options iv_name = 'Reswk' ).
        DATA(lt_dt_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = xsdbool( lt_dt_w IS NOT INITIAL OR lt_dt_r IS NOT INITIAL OR lt_dt_m IS NOT INITIAL ) iv_what = `Werks, Reswk or Matnr eq '...'` is_paging = is_paging ).
        DATA(lt_dt) = zcl_tms_dp=>get_sto( it_werks = lt_dt_w it_reswk = lt_dt_r it_matnr = lt_dt_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_dt ).
        copy_data_to_ref( EXPORTING is_data = lt_dt CHANGING cr_data = er_entityset ).
      WHEN 'DpOpenOrderSet'.
        DATA(lt_do_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_do_v) = filter_values( it_filter = it_filter_select_options iv_name = 'Vtweg' ).
        DATA(lt_do_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = xsdbool( lt_do_w IS NOT INITIAL OR lt_do_m IS NOT INITIAL ) iv_what = `Werks or Matnr eq '...'` is_paging = is_paging ).
        DATA(lt_do) = zcl_tms_dp=>get_open_orders( it_werks = lt_do_w it_vtweg = lt_do_v it_matnr = lt_do_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_do ).
        copy_data_to_ref( EXPORTING is_data = lt_do CHANGING cr_data = er_entityset ).
      WHEN 'DpSaleSet'.
        " Datum ge datetime'..' (required, at most 100 days) and optionally Datum le ..; filters Werks, Vtweg, Matnr (EQ).
        DATA lv_dp_from TYPE d.
        DATA lv_dp_to TYPE d.
        dp_dates( EXPORTING it_filter = it_filter_select_options iv_name = 'Datum' IMPORTING ev_from = lv_dp_from ev_to = lv_dp_to ).
        IF lv_dp_from IS INITIAL.
          busi( `Filter Datum ge datetime'<from>' is mandatory (and optionally Datum le).` ).
        ENDIF.
        IF lv_dp_to IS INITIAL.
          lv_dp_to = sy-datum.
        ENDIF.
        IF lv_dp_to - lv_dp_from > 100.
          busi( `At most 100 days per request.` ).
        ENDIF.
        DATA(lt_dp_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_dp_v) = filter_values( it_filter = it_filter_select_options iv_name = 'Vtweg' ).
        DATA(lt_dp_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = abap_true iv_what = `` is_paging = is_paging ).
        DATA(lt_dp) = zcl_tms_dp=>get_sales( iv_from = lv_dp_from iv_to = lv_dp_to it_werks = lt_dp_w it_vtweg = lt_dp_v it_matnr = lt_dp_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_dp ).
        copy_data_to_ref( EXPORTING is_data = lt_dp CHANGING cr_data = er_entityset ).
      WHEN 'DpTransitSet'.
        DATA(lt_dr_w) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_dr_s) = filter_values( it_filter = it_filter_select_options iv_name = 'Swerks' ).
        DATA(lt_dr_m) = filter_values( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        dp_guard( iv_filtered = xsdbool( lt_dr_w IS NOT INITIAL OR lt_dr_s IS NOT INITIAL OR lt_dr_m IS NOT INITIAL ) iv_what = `Werks, Swerks or Matnr eq '...'` is_paging = is_paging ).
        DATA(lt_dr) = zcl_tms_dp=>get_transit( it_werks = lt_dr_w it_swerks = lt_dr_s it_matnr = lt_dr_m ).
        dp_page( EXPORTING is_paging = is_paging CHANGING ct_tab = lt_dr ).
        copy_data_to_ref( EXPORTING is_data = lt_dr CHANGING cr_data = er_entityset ).
      WHEN 'TripInvoiceSet'.
        " Filter Vbeln eq '<billing>' and/or Vbelv eq '<delivery>' (one is required, at most 50 each); optional Werks eq '<plant>'.
        DATA(lt_tib) = filter_values( it_filter = it_filter_select_options iv_name = 'Vbeln' ).
        DATA(lt_tid) = filter_values( it_filter = it_filter_select_options iv_name = 'Vbelv' ).
        DATA(lt_tiw) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        IF lt_tib IS INITIAL AND lt_tid IS INITIAL.
          busi( `Filter Vbeln eq '<billing document>' or Vbelv eq '<delivery>' is mandatory.` ).
        ENDIF.
        IF lines( lt_tib ) > 50 OR lines( lt_tid ) > 50.
          busi( `At most 50 documents per request.` ).
        ENDIF.
        DATA(lt_ti) = zcl_tms_core=>get_trip_invoices( it_vbeln = lt_tib it_vbelv = lt_tid
                                                       iv_werks = COND #( WHEN lt_tiw IS NOT INITIAL THEN CONV werks_d( lt_tiw[ 1 ] ) ) ).
        copy_data_to_ref( EXPORTING is_data = lt_ti CHANGING cr_data = er_entityset ).
      WHEN 'ParallelCheckSet'.
        DATA(lt_pcw) = filter_values( it_filter = it_filter_select_options iv_name = 'Werks' ).
        DATA(lt_pcd) = filter_values( it_filter = it_filter_select_options iv_name = 'Days' ).
        DATA(lv_days) = COND i( WHEN lt_pcd IS NOT INITIAL AND lt_pcd[ 1 ] CO '0123456789' AND lt_pcd[ 1 ] IS NOT INITIAL THEN lt_pcd[ 1 ] ELSE 30 ).
        IF lv_days > 366.
          lv_days = 366.
        ENDIF.
        DATA(lt_pc) = zcl_tms_core=>parallel_check( iv_werks = COND #( WHEN lt_pcw IS NOT INITIAL THEN CONV werks_d( lt_pcw[ 1 ] ) ) iv_days = lv_days ).
        copy_data_to_ref( EXPORTING is_data = lt_pc CHANGING cr_data = er_entityset ).
      WHEN OTHERS.
        busi( iv_text = |Unknown entity set { iv_entity_set_name }| iv_status = '404' ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    CASE iv_entity_set_name.
      WHEN 'VendorSet'.
        DATA(lt_v) = zcl_tms_core=>get_vendors( iv_lifnr = CONV #( |{ key_value( it_key = it_key_tab iv_name = 'Lifnr' ) ALPHA = IN }| ) iv_max = 1 ).
        IF lt_v IS INITIAL.
          busi( iv_text = `Vendor was not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_v[ 1 ] CHANGING cr_data = er_entity ).
      WHEN 'CustomerSet'.
        DATA(lt_c) = zcl_tms_core=>get_customers( iv_kunnr = CONV #( |{ key_value( it_key = it_key_tab iv_name = 'Kunnr' ) ALPHA = IN }| ) iv_max = 1 ).
        IF lt_c IS INITIAL.
          busi( iv_text = `Customer was not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_c[ 1 ] CHANGING cr_data = er_entity ).
      WHEN 'PoSoCheckSet'.
        DATA(ls_chk) = zcl_tms_core=>check_poso( iv_po = key_value( it_key = it_key_tab iv_name = 'Po' ) iv_so = key_value( it_key = it_key_tab iv_name = 'So' ) ).
        copy_data_to_ref( EXPORTING is_data = ls_chk CHANGING cr_data = er_entity ).
      WHEN 'OutDeliverySet'.
        DATA(lt_od1) = zcl_tms_core=>get_out_deliveries( VALUE #( ( key_value( it_key = it_key_tab iv_name = 'Vbeln' ) ) ) ).
        IF lt_od1 IS INITIAL.
          busi( iv_text = `Delivery was not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_od1[ 1 ] CHANGING cr_data = er_entity ).
      WHEN 'OutShipmentSet'.
        DATA(ls_os1) = zcl_tms_core=>get_out_shipment( CONV #( |{ key_value( it_key = it_key_tab iv_name = 'Tknum' ) ALPHA = IN }| ) ).
        IF ls_os1-tknum IS INITIAL.
          busi( iv_text = `Shipment was not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_os1 CHANGING cr_data = er_entity ).
      WHEN 'PaymentStatusSet'.
        DATA(ls_ps) = zcl_tms_core=>payment_status( CONV #( |{ key_value( it_key = it_key_tab iv_name = 'Belnr' ) ALPHA = IN }| ) ).
        copy_data_to_ref( EXPORTING is_data = ls_ps CHANGING cr_data = er_entity ).
      WHEN OTHERS.
        busi( iv_text = |Unknown entity set { iv_entity_set_name }| iv_status = '404' ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    IF iv_entity_set_name = 'TripVehicleSet'.
      " Trip vehicle + its complete invoice list (ZSMART_VEH replacement). Commits only a fully valid write.
      DATA ls_tv TYPE zcl_tms_ty=>ts_tripvehicle.
      io_data_provider->read_entry_data( IMPORTING es_data = ls_tv ).
      DATA(ls_tvo) = zcl_tms_core=>write_trip_vehicle( is_in = ls_tv iv_user = hub_user( ) ).
      IF ls_tvo-ok <> 'X'.
        ROLLBACK WORK.
        busi( iv_text = CONV #( ls_tvo-message ) ).
      ENDIF.
      COMMIT WORK.
      copy_data_to_ref( EXPORTING is_data = ls_tvo CHANGING cr_data = er_entity ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name <> 'FreightInvoiceSet'.
      busi( iv_text = |{ iv_entity_set_name } is read-only.| iv_status = '405' ).
    ENDIF.
    DATA ls_in TYPE zcl_tms_ty=>ts_freightinvoice.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    DATA(ls_out) = zcl_tms_core=>post_freight_invoice( is_in = ls_in iv_user = hub_user( ) ).
    IF ls_out-belnrfi IS INITIAL AND ls_in-simulated IS INITIAL AND ls_out-message NP 'Check passed*' AND ls_out-message NP 'Validated*'.
      ROLLBACK WORK.
      busi( |{ ls_out-message }| ).
    ENDIF.
    " a check-only call, an error or a duplicate never commits; a new posting commits and waits for the update task
    IF ls_in-simulated IS NOT INITIAL OR ls_out-belnrfi IS INITIAL OR ls_out-message CP 'Already posted*'.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
    copy_data_to_ref( EXPORTING is_data = ls_out CHANGING cr_data = er_entity ).
  ENDMETHOD.

ENDCLASS.
