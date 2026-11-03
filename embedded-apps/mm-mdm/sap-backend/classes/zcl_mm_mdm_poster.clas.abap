"! Poster: posts the approved request into SAP. Moves STND_UPDATE (5,583 lines in the Web Dynpro component controller).
"!
"! Order of the existing method (read from the code, keep it):
"!  1. staging saved, lock, last-level test (CL_WF=>GET_FINAL), BAPI_STDMATERIAL_GETINTNUMBER, attachments and comments
"!  2. BAPI_MATERIAL_SAVEDATA, commit; BAPI_MATERIAL_SAVEDATA again (forecast values and consumption), commit
"!  3. BAPI_RTMAT_RPL_SAVEREPLICAMULT; CM_FV_PROD_VERS_DB_UPDATE; MODIFY /INOWITS/MM_WS_V; UPDATE /INOWITS/CM_META
"!  4. J_1IMTCHID_POST, J_1IASSVAL_POST, J_1IMODDET_POST (India tax); SAVE_CLASS_STD; SAVE_TEXT_STD + CREATE_TEXT
"!  5. BAPI_MATINSPCTRL_SAVEREPLICA; PREFERENCE_PRICE_UPDATE; MAEX_SAVE; BAPI_MATERIAL_SAVEREPLICA; /INOWITS/MM_VARIANTS
"!  6. CL_WF=>COMPLETE (done by ZCL_MM_MDM_WORKFLOW after this class), header status, alerts, phonetic keys (P_PHONETICS to PH_D_M)
"!
"! Changes asked for in the plan (the sequence itself does not change):
"!  - test run first: validator plus BAPI_MATERIAL_SAVEDATA with the test run flag, before anything is posted
"!  - one place for commit and rollback; every commit point is written down below
"!  - retry safety: if the material of this TransId already exists, continue from the first step that is not done
"!  - a failed step raises an exception with its messages; the request stays with the approver
"!
"! OUTLINE. Each step method has to be filled by moving the matching block of STND_UPDATE.
CLASS zcl_mm_mdm_poster DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS post
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
      RAISING   zcx_mm_mdm.

  PRIVATE SECTION.
    DATA mv_transid TYPE zif_mm_mdm_types=>ty_transid.
    DATA mv_matnr   TYPE matnr.

    METHODS test_run                         RAISING zcx_mm_mdm.   "validator and BAPI test run
    METHODS step1_number_and_attachments     RAISING zcx_mm_mdm.   "internal number, attachments, comments
    METHODS step2_save_material              RAISING zcx_mm_mdm.   "BAPI_MATERIAL_SAVEDATA twice, commit after each
    METHODS step3_replenishment_and_versions RAISING zcx_mm_mdm.   "RPL, production versions, work schedule, meta table
    METHODS step4_tax_class_texts            RAISING zcx_mm_mdm.   "India tax, classification, long texts
    METHODS step5_inspection_and_trade       RAISING zcx_mm_mdm.   "inspection setup, preference prices, legal control, replica
    METHODS step6_variants_and_keys          RAISING zcx_mm_mdm.   "variants, phonetic keys
    METHODS already_posted RETURNING VALUE(rv_yes) TYPE abap_bool.
ENDCLASS.

CLASS zcl_mm_mdm_poster IMPLEMENTATION.

  METHOD post.
    mv_transid = iv_transid.
    test_run( ).
    IF already_posted( ) = abap_false.
      step1_number_and_attachments( ).
      step2_save_material( ).
    ENDIF.
    step3_replenishment_and_versions( ).
    step4_tax_class_texts( ).
    step5_inspection_and_trade( ).
    step6_variants_and_keys( ).
    "Commit points of the old method: after each BAPI_MATERIAL_SAVEDATA, RPL, production versions, each India tax post,
    "inspection setup, preference prices, legal control and the replica (about 15 commits). Keep them while the steps are
    "moved; reduce them once the parity tests pass.
  ENDMETHOD.

  METHOD test_run.
    "1. NEW zcl_mm_mdm_validator( mv_transid )->validate( ) must return no error.
    "2. BAPI_MATERIAL_SAVEDATA with the test run flag on the same data; its RETURN messages become exception messages.
  ENDMETHOD.

  METHOD already_posted.
    "The header holds the material number (OBJ_VALUE) after the first successful BAPI call; the material then exists in MARA.
    SELECT SINGLE obj_value FROM /inowits/m_trans WHERE transid = @mv_transid INTO @DATA(lv_obj).
    IF sy-subrc = 0 AND lv_obj IS NOT INITIAL.
      SELECT SINGLE matnr FROM mara WHERE matnr = @lv_obj INTO @mv_matnr.
      rv_yes = xsdbool( sy-subrc = 0 ).
    ENDIF.
  ENDMETHOD.

  METHOD step1_number_and_attachments. ENDMETHOD.
  METHOD step2_save_material. ENDMETHOD.
  METHOD step3_replenishment_and_versions. ENDMETHOD.
  METHOD step4_tax_class_texts. ENDMETHOD.
  METHOD step5_inspection_and_trade. ENDMETHOD.
  METHOD step6_variants_and_keys. ENDMETHOD.

ENDCLASS.
