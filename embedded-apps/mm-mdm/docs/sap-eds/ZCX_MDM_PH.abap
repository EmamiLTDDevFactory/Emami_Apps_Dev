CLASS zcx_mdm_ph DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  CREATE PUBLIC .

  PUBLIC SECTION.

    INTERFACES if_t100_message .
    INTERFACES if_t100_dyn_msg .

    "! Messages that explain the failure (type E / A / W / S, text, field)
    DATA mt_return TYPE bapiret2_t READ-ONLY.

    METHODS constructor
      IMPORTING
        textid    LIKE if_t100_message=>t100key OPTIONAL
        previous  LIKE previous OPTIONAL
        it_return TYPE bapiret2_t OPTIONAL.
    METHODS get_text REDEFINITION.
    CLASS-METHODS from_text
      IMPORTING
        !iv_text      TYPE string
        !iv_field     TYPE string OPTIONAL
        !iv_type      TYPE bapi_mtype DEFAULT 'E'
      RETURNING
        VALUE(ro_exc) TYPE REF TO zcx_mdm_ph .
protected section.
private section.
ENDCLASS.



CLASS ZCX_MDM_PH IMPLEMENTATION.


  METHOD constructor.
    super->constructor( previous = previous ).
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
    mt_return = it_return.
  ENDMETHOD.


  METHOD from_text.
    DATA(lt_return) = VALUE bapiret2_t( ( type = iv_type message = iv_text field = iv_field ) ).
    ro_exc = NEW #( it_return = lt_return ).
  ENDMETHOD.


  METHOD get_text.
    LOOP AT mt_return ASSIGNING FIELD-SYMBOL(<r>) WHERE type CA 'EA'.
      result = <r>-message.
      RETURN.
    ENDLOOP.
    IF mt_return IS NOT INITIAL.
      result = mt_return[ 1 ]-message.
    ELSE.
      result = super->get_text( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
