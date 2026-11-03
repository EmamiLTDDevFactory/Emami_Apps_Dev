"! Small backend functions of the service: description builder, HSN suggestions, duplicate check.
CLASS zcl_mm_mdm_functions DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_desc_in,
             main_group        TYPE c LENGTH 40,
             sub_group         TYPE c LENGTH 40,
             sub_sub_group     TYPE c LENGTH 40,
             description       TYPE c LENGTH 40,
             manufacturer_part TYPE c LENGTH 40,
           END OF ty_desc_in,
           BEGIN OF ty_desc_out,
             text      TYPE c LENGTH 40,
             truncated TYPE abap_bool,
           END OF ty_desc_out,
           BEGIN OF ty_hsn,
             code  TYPE c LENGTH 16,
             text  TYPE c LENGTH 60,
             count TYPE i,
           END OF ty_hsn,
           tt_hsn TYPE STANDARD TABLE OF ty_hsn WITH DEFAULT KEY,
           BEGIN OF ty_dup,
             matnr         TYPE c LENGTH 18,
             description   TYPE c LENGTH 40,
             material_type TYPE c LENGTH 4,
             score         TYPE i,
           END OF ty_dup,
           tt_dup TYPE STANDARD TABLE OF ty_dup WITH DEFAULT KEY.

    "Group texts, description and part number, joined by a space, upper case, 40 characters (MAKTX).
    "The old screens (V_INIT, V_POPUP, V_DESCRITION) check the length against 40; what they do above 40
    "(cut or error) is to be confirmed, here the text is cut and the flag is set.
    CLASS-METHODS build_description
      IMPORTING is_in         TYPE ty_desc_in
      RETURNING VALUE(rs_out) TYPE ty_desc_out.

    "HSN suggestions from the description words (/INOWITS/MM_ASSIST), ranked by the number of words that match a code
    "(agreed improvement: the old class ranks by the position of the word and does not merge duplicates).
    CLASS-METHODS related_hsn
      IMPORTING iv_text       TYPE csequence
      RETURNING VALUE(rt_hsn) TYPE tt_hsn.

    "Duplicate check. First version: words of the description against the standard material descriptions.
    "To do: use the phonetic key (/INOWITS/P_PHONETICS, table /INOWITS/PH_D_M) as ONACTIONCHECK_DUBLICATE does.
    CLASS-METHODS check_duplicate
      IMPORTING iv_description TYPE csequence
                iv_mtart       TYPE mtart OPTIONAL
      RETURNING VALUE(rt_dup)  TYPE tt_dup.
ENDCLASS.

CLASS zcl_mm_mdm_functions IMPLEMENTATION.

  METHOD build_description.
    DATA lv_full TYPE string.
    LOOP AT VALUE string_table( ( CONV string( is_in-main_group ) ) ( CONV string( is_in-sub_group ) ) ( CONV string( is_in-sub_sub_group ) )
                                ( CONV string( is_in-description ) ) ( CONV string( is_in-manufacturer_part ) ) ) INTO DATA(lv_part).
      CONDENSE lv_part.
      IF lv_part IS NOT INITIAL.
        lv_full = COND #( WHEN lv_full IS INITIAL THEN lv_part ELSE |{ lv_full } { lv_part }| ).
      ENDIF.
    ENDLOOP.
    lv_full = to_upper( lv_full ).
    rs_out-truncated = xsdbool( strlen( lv_full ) > 40 ).
    rs_out-text = lv_full.
  ENDMETHOD.

  METHOD related_hsn.
    DATA lt_raw TYPE /inowits/mm_assist=>tt_hsn.
    /inowits/mm_assist=>get_related_hsn( EXPORTING iv_maktx = CONV maktx( iv_text ) IMPORTING et_hsn = lt_raw ).
    LOOP AT lt_raw INTO DATA(ls_raw).
      READ TABLE rt_hsn ASSIGNING FIELD-SYMBOL(<h>) WITH KEY code = ls_raw-steuc.
      IF sy-subrc = 0.
        <h>-count = <h>-count + 1.
      ELSE.
        APPEND VALUE #( code = ls_raw-steuc text = ls_raw-text1 count = 1 ) TO rt_hsn.
      ENDIF.
    ENDLOOP.
    SORT rt_hsn BY count DESCENDING code ASCENDING.
  ENDMETHOD.

  METHOD check_duplicate.
    SPLIT to_upper( CONV string( iv_description ) ) AT space INTO TABLE DATA(lt_word).
    LOOP AT lt_word INTO DATA(lv_word) WHERE table_line IS NOT INITIAL.
      CHECK strlen( lv_word ) > 2.
      DATA(lv_like) = |{ lv_word }%|.
      SELECT m~matnr, m~maktx, a~mtart FROM makt AS m
        INNER JOIN mara AS a ON a~matnr = m~matnr
        WHERE m~spras = @sy-langu AND m~maktg LIKE @lv_like
        INTO TABLE @DATA(lt_hit) UP TO 50 ROWS.
      LOOP AT lt_hit INTO DATA(ls_hit).
        READ TABLE rt_dup ASSIGNING FIELD-SYMBOL(<d>) WITH KEY matnr = ls_hit-matnr.
        IF sy-subrc = 0.
          <d>-score = <d>-score + 1.
        ELSE.
          APPEND VALUE #( matnr = ls_hit-matnr description = ls_hit-maktx material_type = ls_hit-mtart score = 1 ) TO rt_dup.
        ENDIF.
      ENDLOOP.
      CLEAR lt_hit.
    ENDLOOP.
    SORT rt_dup BY score DESCENDING matnr ASCENDING.
    IF lines( rt_dup ) > 10.
      DELETE rt_dup FROM 11.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
