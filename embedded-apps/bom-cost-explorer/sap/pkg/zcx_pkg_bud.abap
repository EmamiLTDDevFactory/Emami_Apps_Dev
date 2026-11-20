CLASS zcx_pkg_bud DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  CREATE PUBLIC .

  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING
        !iv_text  TYPE string OPTIONAL
        !textid   LIKE textid OPTIONAL
        !previous LIKE previous OPTIONAL .

    METHODS if_message~get_text REDEFINITION.
ENDCLASS.



CLASS zcx_pkg_bud IMPLEMENTATION.

  METHOD constructor.
    CALL METHOD super->constructor
      EXPORTING
        textid   = textid
        previous = previous.
    mv_text = iv_text.
  ENDMETHOD.

  METHOD if_message~get_text.
    IF mv_text IS NOT INITIAL.
      result = mv_text.
    ELSE.
      result = super->get_text( ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
