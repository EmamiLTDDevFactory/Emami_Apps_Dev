CLASS zcl_life_ins_reg3 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_life_ins_reg3 IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    " The ICF step of /IWFND/CL_ICF_ACCESS=>CREATE_GW_SERVICE_ICF_NODE fails here, so the node /sap/opu/odata/sap/ZLIFE_INS_SRV
    " is inserted directly with the same call the standard method makes (same parent as ZMEDICLAIM_SRV).
    DATA: lv_parent  TYPE icfnodguid,
          lv_node    TYPE icfnodguid,
          lv_alt     TYPE icfaltnme VALUE 'zlife_ins_srv',
          lv_docu    TYPE icfdocu VALUE 'ZLIFE_INS_SRV',
          ls_serdesc TYPE icfserdesc,
          lt_hand    TYPE icfhndlist,
          lv_task    TYPE trkorr VALUE 'EDSK9B0EKC'.
    SELECT SINGLE icfparguid FROM icfservice INTO @lv_parent WHERE icf_name = 'ZMEDICLAIM_SRV'.
    IF sy-subrc <> 0.
      out->write( 'parent node (sap/opu/odata/sap) not found via ZMEDICLAIM_SRV' ).
      RETURN.
    ENDIF.
    APPEND '/IWFND/CL_SODATA_HTTP_HANDLER' TO lt_hand.
    ls_serdesc-icf_mandt = sy-mandt.
    cl_icf_tree=>if_icf_tree~insert_node(
      EXPORTING icfaltnme = lv_alt icfparguid = lv_parent icfdocu = lv_docu icfhandlst = lt_hand icfactive = abap_true
                package = 'ZEMAMI_MEDICLAIM' application = space icfserdesc = ls_serdesc
      IMPORTING icfnodguid = lv_node
      CHANGING  transport = lv_task
      EXCEPTIONS empty_icf_name = 1 no_new_virtual_host = 2 special_service_error = 3 parent_not_existing = 4 enqueue_error = 5
                 node_already_existing = 6 empty_docu = 7 doculang_not_installed = 8 security_info_error = 9 user_password_error = 10
                 password_encryption_error = 11 invalid_url = 12 invalid_otr_concept = 13 formflg401_error = 14 handler_error = 15
                 transport_error = 16 tadir_error = 17 package_not_found = 18 wrong_application = 19 not_allow_application = 20
                 no_application = 21 invalid_icfparguid = 22 alt_name_invalid = 23 alternate_name_exist = 24 wrong_icf_name = 25
                 no_authority = 26 OTHERS = 27 ).
    out->write( |insert_node subrc { sy-subrc }, node { lv_node }, task { lv_task }| ).
    IF sy-subrc = 0 OR sy-subrc = 6 OR sy-subrc = 24.
      COMMIT WORK.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
