"! Business error of the Mediclaim logic. The text is the verbatim message shown to the user.
CLASS zcx_medi_error DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor
      IMPORTING iv_text   TYPE string OPTIONAL
                !previous LIKE previous OPTIONAL.
    METHODS if_message~get_text REDEFINITION.
ENDCLASS.

CLASS zcx_medi_error IMPLEMENTATION.
  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    mv_text = iv_text.
  ENDMETHOD.

  METHOD if_message~get_text.
    result = mv_text.
  ENDMETHOD.
ENDCLASS.
