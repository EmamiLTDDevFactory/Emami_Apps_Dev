CLASS zcl_zmdm_ph_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zmdm_ph_dpc CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_entity REDEFINITION.

  PROTECTED SECTION.
    METHODS levelvalueset_get_entityset REDEFINITION.
    METHODS costcenterset_get_entityset REDEFINITION.
    METHODS requestset_get_entityset    REDEFINITION.
    METHODS requestset_get_entity       REDEFINITION.
    METHODS requestset_create_entity    REDEFINITION.
    METHODS workitemset_get_entityset   REDEFINITION.
    METHODS workitemset_get_entity      REDEFINITION.

  PRIVATE SECTION.
    METHODS crs_out
      IMPORTING is_req TYPE zcl_mdm_crs_core=>ty_request
      RETURNING VALUE(rs_out) TYPE zcl_zmdm_ph_mpc_ext=>ts_crsrequest.
    METHODS crs_in
      IMPORTING is_in TYPE zcl_zmdm_ph_mpc_ext=>ts_crsrequest
      RETURNING VALUE(rs_req) TYPE zcl_mdm_crs_core=>ty_request.
    METHODS crs_action
      IMPORTING it_params TYPE /iwbep/t_mgw_name_value_pair iv_name TYPE string
      RETURNING VALUE(rs_out) TYPE zcl_zmdm_ph_mpc_ext=>ts_crsrequest
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS raise_busi
      IMPORTING ix TYPE REF TO zcx_mdm_ph
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS param
      IMPORTING it_params TYPE /iwbep/t_mgw_name_value_pair iv_name TYPE string
      RETURNING VALUE(rv_value) TYPE string.
    METHODS to_request
      IMPORTING it_params TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_request) TYPE zcl_mdm_ph_core=>ty_request.
    METHODS filter_value
      IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_prop TYPE string
      RETURNING VALUE(rv_value) TYPE string.
ENDCLASS.



CLASS ZCL_ZMDM_PH_DPC_EXT IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    IF iv_action_name CP 'Crs*'.
      copy_data_to_ref( EXPORTING is_data = crs_action( it_params = it_parameter iv_name = iv_action_name )
                        CHANGING cr_data = er_data ).
      RETURN.
    ENDIF.
    DATA(ls_req) = to_request( it_parameter ).
    TRY.
        CASE iv_action_name.
          WHEN 'Validate'.
            zcl_mdm_ph_core=>validate( EXPORTING iv_mode = CONV #( param( it_params = it_parameter iv_name = 'Mode' ) )
                                       CHANGING cs_request = ls_req ).
          WHEN 'Approve'.
            zcl_mdm_ph_core=>approve( EXPORTING iv_wi_id = CONV #( param( it_params = it_parameter iv_name = 'WiId' ) )
                                      CHANGING cs_request = ls_req ).
          WHEN 'AssignCostCenter'.
            zcl_mdm_ph_core=>assign_cost_center(
              EXPORTING iv_wi_id = CONV #( param( it_params = it_parameter iv_name = 'WiId' ) )
                        iv_cost_center = param( it_params = it_parameter iv_name = 'CostCenter' )
              CHANGING cs_request = ls_req ).
          WHEN 'RejectRequest'.
            zcl_mdm_ph_core=>reject( CONV #( param( it_params = it_parameter iv_name = 'WiId' ) ) ).
            ls_req-message = 'Request rejected'.
          WHEN 'SendBackRequest'.
            zcl_mdm_ph_core=>send_back( CONV #( param( it_params = it_parameter iv_name = 'WiId' ) ) ).
            ls_req-message = 'Request sent back'.
          WHEN OTHERS.
            RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception.
        ENDCASE.
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = CORRESPONDING zcl_zmdm_ph_mpc=>ts_request( ls_req )
                      CHANGING cr_data = er_data ).
  ENDMETHOD.


  METHOD costcenterset_get_entityset.
    et_entityset = CORRESPONDING #( zcl_mdm_ph_core=>get_cost_centers(
      iv_kostl = filter_value( it_filter = it_filter_select_options iv_prop = 'Kostl' )
      iv_text  = filter_value( it_filter = it_filter_select_options iv_prop = 'Text' )
      iv_max   = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 500 ) ) ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.


  METHOD filter_value.
    READ TABLE it_filter ASSIGNING FIELD-SYMBOL(<f>) WITH KEY property = iv_prop.
    IF sy-subrc = 0 AND <f>-select_options IS NOT INITIAL.
      rv_value = <f>-select_options[ 1 ]-low.
    ENDIF.
  ENDMETHOD.


  METHOD levelvalueset_get_entityset.
    DATA(lv_level) = filter_value( it_filter = it_filter_select_options iv_prop = 'Level' ).
    IF lv_level NOT BETWEEN '1' AND '6'.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid            = /iwbep/cx_mgw_busi_exception=>business_error
          message_unlimited = 'Filter Level (1-6) is required'.
    ENDIF.
    DATA(lt_vals) = zcl_mdm_ph_core=>get_level_values(
      iv_level  = CONV i( lv_level )
      iv_code   = filter_value( it_filter = it_filter_select_options iv_prop = 'Code' )
      iv_text   = filter_value( it_filter = it_filter_select_options iv_prop = 'Text' )
      iv_parent = filter_value( it_filter = it_filter_select_options iv_prop = 'Parent' )
      iv_max    = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 500 ) ).
    et_entityset = CORRESPONDING #( lt_vals ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.


  METHOD param.
    rv_value = VALUE #( it_params[ name = iv_name ]-value DEFAULT `` ).
  ENDMETHOD.


  METHOD raise_busi.
    DATA(lo_msg) = mo_context->get_message_container( ).
    LOOP AT ix->mt_return ASSIGNING FIELD-SYMBOL(<r>).
      lo_msg->add_message_text_only(
        iv_msg_type               = <r>-type
        iv_msg_text               = CONV #( <r>-message )
        iv_error_category         = /iwbep/if_message_container=>gcs_error_category-processing
        iv_add_to_response_header = abap_false
        iv_message_target         = CONV #( <r>-field ) ).
    ENDLOOP.
    IF ix->mt_return IS INITIAL.
      lo_msg->add_message_text_only(
        iv_msg_type       = 'E'
        iv_msg_text       = CONV #( ix->get_text( ) )
        iv_error_category = /iwbep/if_message_container=>gcs_error_category-processing ).
    ENDIF.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message_container = lo_msg.
  ENDMETHOD.


  METHOD requestset_create_entity.            " job I – Initiate
    DATA ls_in TYPE zcl_mdm_ph_core=>ty_request.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    TRY.
        zcl_mdm_ph_core=>initiate( CHANGING cs_request = ls_in ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    er_entity = CORRESPONDING #( ls_in ).
  ENDMETHOD.


  METHOD requestset_get_entity.
    DATA(lv_id) = VALUE string( it_key_tab[ name = 'TransactionId' ]-value OPTIONAL ).
    DATA(lt_req) = zcl_mdm_ph_core=>get_requests( iv_transaction_id = lv_id iv_max = 1 ).
    IF lt_req IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
          entity_type = iv_entity_name.
    ENDIF.
    er_entity = CORRESPONDING #( lt_req[ 1 ] ).
  ENDMETHOD.


  METHOD requestset_get_entityset.
    DATA(lt_req) = zcl_mdm_ph_core=>get_requests(
      iv_initiator      = filter_value( it_filter = it_filter_select_options iv_prop = 'Initiator' )
      iv_transaction_id = filter_value( it_filter = it_filter_select_options iv_prop = 'TransactionId' )
      iv_wi_id          = filter_value( it_filter = it_filter_select_options iv_prop = 'WiId' )
      iv_max            = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 100 ) ).
    DATA(lv_step) = filter_value( it_filter = it_filter_select_options iv_prop = 'Step' ).
    IF lv_step IS NOT INITIAL.
      DELETE lt_req WHERE step <> lv_step.
    ENDIF.
    et_entityset = CORRESPONDING #( lt_req ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.


  METHOD to_request.
    rs_request = VALUE #(
      banner = param( it_params = it_params iv_name = 'Banner' )
      banner_desc = param( it_params = it_params iv_name = 'BannerDesc' )
      brand = param( it_params = it_params iv_name = 'Brand' )
      brand_desc = param( it_params = it_params iv_name = 'BrandDesc' )
      product = param( it_params = it_params iv_name = 'Product' )
      product_desc = param( it_params = it_params iv_name = 'ProductDesc' )
      sku = param( it_params = it_params iv_name = 'Sku' )
      sku_desc = param( it_params = it_params iv_name = 'SkuDesc' )
      variant = param( it_params = it_params iv_name = 'Variant' )
      variant_desc = param( it_params = it_params iv_name = 'VariantDesc' )
      scheme = param( it_params = it_params iv_name = 'Scheme' )
      scheme_desc = param( it_params = it_params iv_name = 'SchemeDesc' ) ).
  ENDMETHOD.


  METHOD workitemset_get_entity.
    TRY.
        DATA(lt_items) = zcl_mdm_ph_core=>get_inbox( ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    DATA(lv_wi) = VALUE string( it_key_tab[ name = 'WiId' ]-value OPTIONAL ).
    READ TABLE lt_items INTO DATA(ls_item) WITH KEY wi_id = lv_wi.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
          entity_type = iv_entity_name.
    ENDIF.
    er_entity = CORRESPONDING #( ls_item ).
  ENDMETHOD.


  METHOD workitemset_get_entityset.
    TRY.
        DATA(lt_items) = zcl_mdm_ph_core=>get_inbox( ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    et_entityset = CORRESPONDING #( lt_items ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    CASE iv_entity_set_name.
      WHEN 'CrsValueSet'.
        DATA(lv_level) = filter_value( it_filter = it_filter_select_options iv_prop = 'Level' ).
        IF lv_level NOT BETWEEN '1' AND '3'.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              textid            = /iwbep/cx_mgw_busi_exception=>business_error
              message_unlimited = 'Filter Level (1-3) is required'.
        ENDIF.
        DATA(lt_vals) = zcl_mdm_crs_core=>get_values(
          iv_level = CONV i( lv_level )
          iv_prod  = filter_value( it_filter = it_filter_select_options iv_prop = 'CrsProd' )
          iv_group = filter_value( it_filter = it_filter_select_options iv_prop = 'PrdGrp' )
          iv_code  = filter_value( it_filter = it_filter_select_options iv_prop = 'Code' )
          iv_text  = filter_value( it_filter = it_filter_select_options iv_prop = 'Text' )
          iv_max   = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 500 ) ).
        DATA lt_out TYPE STANDARD TABLE OF zcl_zmdm_ph_mpc_ext=>ts_crsvalue WITH EMPTY KEY.
        LOOP AT lt_vals ASSIGNING FIELD-SYMBOL(<v>).
          APPEND VALUE #( level = <v>-level code = <v>-code text = <v>-text crsprod = <v>-crs_prod
                          prdgrp = <v>-prd_grp skusize = COND #( WHEN <v>-sku_size IS NOT INITIAL THEN |{ <v>-sku_size }| ) unit = <v>-unit ) TO lt_out.
        ENDLOOP.
        IF is_paging-skip > 0.
          DELETE lt_out TO is_paging-skip.
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_out CHANGING cr_data = er_entityset ).
      WHEN 'CrsVerticalSet'.
        DATA lt_vert TYPE STANDARD TABLE OF zcl_zmdm_ph_mpc_ext=>ts_crsvertical WITH EMPTY KEY.
        lt_vert = CORRESPONDING #( zcl_mdm_crs_core=>get_verticals( ) ).
        copy_data_to_ref( EXPORTING is_data = lt_vert CHANGING cr_data = er_entityset ).
      WHEN 'CrsWorkItemSet'.
        DATA lt_wi TYPE STANDARD TABLE OF zcl_zmdm_ph_mpc_ext=>ts_crsworkitem WITH EMPTY KEY.
        TRY.
            LOOP AT zcl_mdm_crs_core=>get_inbox( ) ASSIGNING FIELD-SYMBOL(<w>).
              APPEND VALUE #( wiid = <w>-wi_id transactionid = <w>-transaction_id mode = <w>-mode text = <w>-text
                              status = <w>-status initiator = <w>-initiator createdon = |{ <w>-created_on }| ) TO lt_wi.
            ENDLOOP.
          CATCH zcx_mdm_ph INTO DATA(lx_w).
            raise_busi( lx_w ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = lt_wi CHANGING cr_data = er_entityset ).
      WHEN 'CrsRequestSet'.
        DATA lt_rq TYPE STANDARD TABLE OF zcl_zmdm_ph_mpc_ext=>ts_crsrequest WITH EMPTY KEY.
        LOOP AT zcl_mdm_crs_core=>get_requests(
            iv_initiator      = filter_value( it_filter = it_filter_select_options iv_prop = 'Initiator' )
            iv_transaction_id = filter_value( it_filter = it_filter_select_options iv_prop = 'TransactionId' )
            iv_wi_id          = filter_value( it_filter = it_filter_select_options iv_prop = 'WiId' )
            iv_max            = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 100 ) )
            ASSIGNING FIELD-SYMBOL(<r>).
          APPEND crs_out( <r> ) TO lt_rq.
        ENDLOOP.
        IF is_paging-skip > 0.
          DELETE lt_rq TO is_paging-skip.
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = lt_rq CHANGING cr_data = er_entityset ).
      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~get_entityset(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name
                    iv_source_name = iv_source_name it_filter_select_options = it_filter_select_options
                    it_order = it_order is_paging = is_paging it_navigation_path = it_navigation_path
                    it_key_tab = it_key_tab iv_filter_string = iv_filter_string
                    iv_search_string = iv_search_string io_tech_request_context = io_tech_request_context
          IMPORTING er_entityset = er_entityset es_response_context = es_response_context ).
    ENDCASE.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    IF iv_entity_set_name = 'CrsRequestSet'.
      DATA(lv_id) = VALUE string( it_key_tab[ name = 'TransactionId' ]-value OPTIONAL ).
      DATA(lt_req) = zcl_mdm_crs_core=>get_requests( iv_transaction_id = lv_id iv_max = 1 ).
      IF lt_req IS INITIAL.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
            entity_type = iv_entity_name.
      ENDIF.
      copy_data_to_ref( EXPORTING is_data = crs_out( lt_req[ 1 ] ) CHANGING cr_data = er_entity ).
    ELSE.
      super->/iwbep/if_mgw_appl_srv_runtime~get_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name
                  iv_source_name = iv_source_name it_key_tab = it_key_tab
                  io_tech_request_context = io_tech_request_context
                  it_navigation_path = it_navigation_path
        IMPORTING er_entity = er_entity es_response_context = es_response_context ).
    ENDIF.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    IF iv_entity_set_name = 'CrsRequestSet'.
      DATA ls_in TYPE zcl_zmdm_ph_mpc_ext=>ts_crsrequest.
      io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
      DATA(ls_req) = crs_in( ls_in ).
      TRY.
          zcl_mdm_crs_core=>initiate( CHANGING cs_request = ls_req ).
        CATCH zcx_mdm_ph INTO DATA(lx).
          raise_busi( lx ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = crs_out( ls_req ) CHANGING cr_data = er_entity ).
    ELSE.
      super->/iwbep/if_mgw_appl_srv_runtime~create_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name
                  iv_source_name = iv_source_name it_key_tab = it_key_tab
                  io_tech_request_context = io_tech_request_context
                  it_navigation_path = it_navigation_path io_data_provider = io_data_provider
        IMPORTING er_entity = er_entity ).
    ENDIF.
  ENDMETHOD.


  METHOD crs_action.
    DATA(ls_req) = VALUE zcl_mdm_crs_core=>ty_request(
      crs_prod = param( it_params = it_params iv_name = 'CrsProd' )
      crs_prod_desc = param( it_params = it_params iv_name = 'CrsProdDesc' )
      prd_grp = param( it_params = it_params iv_name = 'PrdGrp' )
      prd_grp_desc = param( it_params = it_params iv_name = 'PrdGrpDesc' )
      sku_grp = param( it_params = it_params iv_name = 'SkuGrp' )
      sku_grp_desc = param( it_params = it_params iv_name = 'SkuGrpDesc' )
      bus_vert = param( it_params = it_params iv_name = 'BusVert' )
      sku_size = param( it_params = it_params iv_name = 'SkuSize' )
      unit = param( it_params = it_params iv_name = 'Unit' )
      comments = param( it_params = it_params iv_name = 'Comments' ) ).
    TRY.
        CASE iv_name.
          WHEN 'CrsValidate'.
            DATA(lv_mode) = param( it_params = it_params iv_name = 'Mode' ).
            zcl_mdm_crs_core=>validate( EXPORTING iv_mode = COND #( WHEN lv_mode IS INITIAL THEN 'I' ELSE lv_mode )
                                        CHANGING cs_request = ls_req ).
            ls_req-message = 'Valid'.
          WHEN 'CrsApprove'.
            zcl_mdm_crs_core=>approve( EXPORTING iv_wi_id = CONV #( |{ param( it_params = it_params iv_name = 'WiId' ) ALPHA = IN }| )
                                       CHANGING cs_request = ls_req ).
          WHEN 'CrsReject'.
            zcl_mdm_crs_core=>reject( CONV #( |{ param( it_params = it_params iv_name = 'WiId' ) ALPHA = IN }| ) ).
            ls_req-message = 'Request rejected'.
          WHEN OTHERS.
            RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception.
        ENDCASE.
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    rs_out = crs_out( ls_req ).
  ENDMETHOD.


  METHOD crs_out.
    rs_out = VALUE #(
      transactionid = is_req-transaction_id wiid = is_req-wi_id
      crsprod = is_req-crs_prod crsproddesc = is_req-crs_prod_desc
      prdgrp = is_req-prd_grp prdgrpdesc = is_req-prd_grp_desc
      skugrp = is_req-sku_grp skugrpdesc = is_req-sku_grp_desc
      busvert = is_req-bus_vert skusize = COND #( WHEN is_req-sku_size IS NOT INITIAL THEN |{ is_req-sku_size }| ) unit = is_req-unit
      comments = is_req-comments flname = is_req-fl_name fltype = is_req-fl_type
      step = is_req-step initiator = is_req-initiator
      createdon = |{ is_req-created_on }| createdat = |{ is_req-created_at }|
      message = is_req-message ).
  ENDMETHOD.


  METHOD crs_in.
    rs_req = VALUE #(
      crs_prod = is_in-crsprod crs_prod_desc = is_in-crsproddesc
      prd_grp = is_in-prdgrp prd_grp_desc = is_in-prdgrpdesc
      sku_grp = is_in-skugrp sku_grp_desc = is_in-skugrpdesc
      bus_vert = is_in-busvert sku_size = is_in-skusize unit = is_in-unit
      comments = is_in-comments fl_name = is_in-flname fl_type = is_in-fltype
      fl_data = is_in-fldata ).
  ENDMETHOD.
ENDCLASS.
