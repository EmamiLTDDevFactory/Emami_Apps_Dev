CLASS zcl_life_ins_reg DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_life_ins_reg IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: ls_model TYPE /iwbep/cl_mgw_med_reg_api=>ty_s_model,
          ls_serv  TYPE /iwbep/cl_mgw_med_reg_api=>ty_s_service,
          lv_pack  TYPE devclass VALUE 'ZEMAMI_MEDICLAIM',
          lv_task  TYPE trkorr VALUE 'EDSK9B0EKC'.
    ls_model-technical_name = 'ZLIFE_INS_MDL'.
    ls_model-version = '0001'.
    ls_model-description = 'Term Life policy model'.
    ls_model-language = 'E'.
    ls_model-class_name = 'ZCL_ZLIFE_INS_MPC'.
    TRY.
        /iwbep/cl_mgw_med_reg_api=>create_model( EXPORTING is_model = ls_model iv_suppress_dialog = 'X'
                                                 CHANGING cv_package = lv_pack cv_task = lv_task ).
        out->write( |model created, task { lv_task }, package { lv_pack }| ).
      CATCH /iwbep/cx_mgw_med_exception INTO DATA(lx).
        out->write( |create_model: { lx->get_text( ) }| ).
    ENDTRY.
    ls_serv-technical_name = 'ZLIFE_INS_SRV'.
    ls_serv-version = '0001'.
    ls_serv-external_name = 'ZLIFE_INS_SRV'.
    ls_serv-description = 'Term Life policy service'.
    ls_serv-language = 'E'.
    ls_serv-class_name = 'ZCL_ZLIFE_INS_DPC'.
    TRY.
        /iwbep/cl_mgw_med_reg_api=>create_service( EXPORTING is_service = ls_serv iv_suppress_dialog = 'X'
                                                   CHANGING cv_package = lv_pack cv_task = lv_task ).
        out->write( |service created, task { lv_task }| ).
      CATCH /iwbep/cx_mgw_med_exception INTO lx.
        out->write( |create_service: { lx->get_text( ) }| ).
    ENDTRY.
    TRY.
        /iwbep/cl_mgw_med_reg_api=>assign_model_to_service( EXPORTING iv_service_technical_name = 'ZLIFE_INS_SRV' iv_service_version = '0001'
                                                              iv_model_technical_name = 'ZLIFE_INS_MDL' iv_model_version = '0001'
                                                              iv_suppress_dialog = 'X' CHANGING cv_task = lv_task ).
        out->write( |model assigned, task { lv_task }| ).
      CATCH /iwbep/cx_mgw_med_exception INTO lx.
        out->write( |assign: { lx->get_text( ) }| ).
    ENDTRY.
    COMMIT WORK.
  ENDMETHOD.
ENDCLASS.
