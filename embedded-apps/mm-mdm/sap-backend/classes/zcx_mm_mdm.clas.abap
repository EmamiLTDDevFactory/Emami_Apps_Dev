"! Exception of the material master request service. Carries all messages of the failed operation.
CLASS zcx_mm_mdm DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.

  PUBLIC SECTION.
    DATA mt_msg TYPE zif_mm_mdm_types=>tt_msg READ-ONLY.

    METHODS constructor
      IMPORTING previous LIKE previous OPTIONAL
                it_msg   TYPE zif_mm_mdm_types=>tt_msg OPTIONAL.

    METHODS if_message~get_text REDEFINITION.

    "One error text, optional target field
    CLASS-METHODS raise_text
      IMPORTING iv_text   TYPE csequence
                iv_code   TYPE csequence DEFAULT 'E'
                iv_target TYPE csequence OPTIONAL
      RAISING   zcx_mm_mdm.

    CLASS-METHODS raise_msgs
      IMPORTING it_msg TYPE zif_mm_mdm_types=>tt_msg
      RAISING   zcx_mm_mdm.

ENDCLASS.

CLASS zcx_mm_mdm IMPLEMENTATION.

  METHOD constructor.
    super->constructor( previous = previous ).
    mt_msg = it_msg.
  ENDMETHOD.

  METHOD if_message~get_text.
    IF mt_msg IS NOT INITIAL.
      result = mt_msg[ 1 ]-message.
    ELSE.
      result = super->if_message~get_text( ).
    ENDIF.
  ENDMETHOD.

  METHOD raise_text.
    RAISE EXCEPTION TYPE zcx_mm_mdm
      EXPORTING it_msg = VALUE #( ( code = iv_code message = iv_text severity = 'E' target = iv_target ) ).
  ENDMETHOD.

  METHOD raise_msgs.
    RAISE EXCEPTION TYPE zcx_mm_mdm EXPORTING it_msg = it_msg.
  ENDMETHOD.

ENDCLASS.
