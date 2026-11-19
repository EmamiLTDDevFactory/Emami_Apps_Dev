CLASS zcl_ztms_reg2 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_ztms_reg2 IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    " Same calls as transaction /IWFND/MAINT_SERVICE "Add Service" for system alias LOCAL (report /IWFND/R_MGW_REGISTRATION, form ADD_SERVICES)
    DATA: lo_activator TYPE REF TO /iwfnd/cl_med_rem_activation,
          lo_explorer  TYPE REF TO /iwfnd/cl_med_rem_exploration,
          lo_icf       TYPE REF TO /iwfnd/cl_icf_access,
          lt_models    TYPE /iwfnd/cl_med_rem_exploration=>ty_t_object_models,
          ls_usage     TYPE /iwfnd/s_med_mdl_usage,
          lt_maps      TYPE /iwfnd/cl_med_rem_activation=>ty_t_object_model_mappings,
          ls_map       TYPE /iwfnd/cl_med_rem_activation=>ty_s_object_model_mapping,
          ls_service   TYPE /iwfnd/cl_med_rem_exploration=>ty_s_service_group,
          lv_srg_id    TYPE /iwfnd/med_mdl_service_grp_id,
          lv_ns        TYPE /iwfnd/med_mdl_namespace,
          lv_name      TYPE /iwfnd/med_mdl_name,
          lv_srg_ident TYPE /iwfnd/med_mdl_srg_identifier,
          lv_transport TYPE trkorr VALUE 'EDSK9B0EM4',
          lt_handlers  TYPE icfhndlist,
          lt_docu      TYPE /iwfnd/cl_icf_access=>ty_t_icfdocu,
          lv_guid      TYPE icfparguid.
    " lt_docu / lv_guid / lt_handlers no longer used
    CONSTANTS: lc_service TYPE string VALUE 'ZTMS_SRV',
               lc_version TYPE /iwfnd/med_mdl_version VALUE '0001',
               lc_alias   TYPE /iwfnd/defi_system_alias VALUE 'LOCAL',
               lc_package TYPE devclass VALUE 'ZEMAMI'.
    TRY.
        lo_activator = /iwfnd/cl_med_rem_activation=>get_remote_activator( ).
        lo_explorer = /iwfnd/cl_med_rem_exploration=>get_remote_explorer( ).
        lo_icf = /iwfnd/cl_icf_access=>get_icf_access( ).

        lo_explorer->get_bep_object_models(
          EXPORTING iv_system_alias = lc_alias iv_service_group_name = CONV #( lc_service ) iv_service_group_version = lc_version
          IMPORTING et_object_models = lt_models es_model_usage = ls_usage ).
        out->write( |backend models found: { lines( lt_models ) }| ).

        LOOP AT lt_models INTO DATA(ls_model).
          CLEAR ls_map.
          /iwfnd/cl_med_utils=>normalize_srv_mdl_name( EXPORTING iv_service_name = CONV #( ls_model-technical_name )
                                                       IMPORTING ev_namespace = ls_model-namespace ev_name = lv_srg_id ).
          ls_map-remote_tech_name = ls_model-technical_name.
          ls_map-remote_version = ls_model-version.
          ls_map-technical_name = lv_srg_id.
          ls_map-version = ls_model-version.
          ls_map-namespace = ls_model-namespace.
          ls_map-external_name = lc_service.
          ls_map-description = ls_model-description.
          INSERT ls_map INTO TABLE lt_maps.
        ENDLOOP.

        CLEAR lv_srg_id.
        lv_name = lc_service.
        /iwfnd/cl_med_utils=>normalize_srv_mdl_name( EXPORTING iv_service_name = CONV #( lv_name ) IMPORTING ev_name = lv_srg_id ev_namespace = lv_ns ).
        ls_service-namespace = lv_ns.
        ls_service-external_name = lc_service.
        ls_service-description = 'SmarTruck TMS service'.
        ls_service-technical_name = lv_srg_id.
        ls_service-version = lc_version.
        ls_service-bep_technical_name = lc_service.
        ls_service-bep_version = lc_version.

        SELECT SINGLE srv_identifier FROM /iwfnd/i_med_srh INTO @lv_srg_ident WHERE srv_identifier = 'ZTMS_SRV_0001'.
        IF sy-subrc = 0.
          out->write( |gateway service already exists: { lv_srg_ident }| ).
        ELSE.
          lo_activator->create_gw_service(
            EXPORTING is_service = ls_service it_object_model_mapping = lt_maps is_model_usage = ls_usage
                      iv_model_type = /iwfnd/cl_med_rem_activation=>gc_s_model_types-bep iv_package = lc_package
                      iv_default_client = abap_true iv_system_alias = lc_alias
                      iv_generator = /iwfnd/if_med_info=>gcs_generator_info_name-maint_service iv_suppress_dialog = abap_true
            IMPORTING ev_srg_identifier = lv_srg_ident
            CHANGING  cv_transport = lv_transport ).
          out->write( |gateway service created: { lv_srg_ident } transport { lv_transport }| ).

        ENDIF.
        " ICF node is created by ZCL_LIFE_INS_REG3 (the API's own ICF step fails on this system)
        lo_activator->create_destination_assignment( iv_srg_identifier = lv_srg_ident iv_system_alias = lc_alias ).
        out->write( |system alias { lc_alias } assigned| ).
        COMMIT WORK.
      CATCH cx_root INTO DATA(lx).
        out->write( |ERROR { lx->get_text( ) } ({ cl_abap_classdescr=>describe_by_object_ref( lx )->get_relative_name( ) })| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
