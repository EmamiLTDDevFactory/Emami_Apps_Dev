"! Data provider of OData service ZTMS_SRV (code based, no SEGW project): maps requests to ZCL_TMS_CORE. Reads: VendorSet, CustomerSet,
"! PoSoCheckSet, PaymentStatusSet, OutDeliverySet, OutShipmentSet, LaneSet (freight condition ZB00 via CDS ZI_TMS_LANERATE),
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
