"! Generic entry point of the MDM admin screens (rules, workflow maintenance, worklist, dashboard).
"! One OData entity (AdminCall) carries Area / Op / Actor / Payload (JSON text) in and Result (JSON text) out; the area class
"! ZCL_MM_MDM_ADM_<AREA> (WF, RULES, UWL, DASH) implements method RUN. Authorization is decided by the hub (admin grant) and passed
"! as the actor e-mail; the gateway user cannot be used for it. Errors come back as {"ok":false,"messages":[...]}, never as a dump.
CLASS zcl_mm_mdm_admin DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS call
      IMPORTING iv_area          TYPE clike
                iv_op            TYPE clike
                iv_actor         TYPE clike OPTIONAL
                iv_payload       TYPE string OPTIONAL
      RETURNING VALUE(rv_result) TYPE string.

    "! Helper for the area classes: {"ok":false,"messages":[{"severity":"E","message":iv_text}]}
    CLASS-METHODS error_json
      IMPORTING iv_text          TYPE clike
      RETURNING VALUE(rv_result) TYPE string.
ENDCLASS.



CLASS ZCL_MM_MDM_ADMIN IMPLEMENTATION.

  METHOD error_json.
    DATA(lv_t) = CONV string( iv_text ).
    REPLACE ALL OCCURRENCES OF '\' IN lv_t WITH '\\'.
    REPLACE ALL OCCURRENCES OF '"' IN lv_t WITH '\"'.
    rv_result = |\{"ok":false,"messages":[\{"severity":"E","message":"{ lv_t }"\}]\}|.
  ENDMETHOD.

  METHOD call.
    DATA(lv_cls) = |ZCL_MM_MDM_ADM_{ to_upper( CONV string( iv_area ) ) }|.
    IF NOT ( to_upper( CONV string( iv_area ) ) CO 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_' ).
      rv_result = error_json( 'Unknown area' ). RETURN.
    ENDIF.
    TRY.
        CALL METHOD (lv_cls)=>run
          EXPORTING iv_op = iv_op iv_actor = iv_actor iv_payload = iv_payload
          RECEIVING rv_json = rv_result.
      CATCH cx_sy_dyn_call_illegal_class cx_sy_dyn_call_illegal_method.
        rv_result = error_json( |Area { iv_area } is not available| ).
      CATCH cx_root INTO DATA(lx).
        rv_result = error_json( lx->get_text( ) ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
