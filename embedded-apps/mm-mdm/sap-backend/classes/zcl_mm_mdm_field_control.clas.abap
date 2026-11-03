*&---------------------------------------------------------------------*
*& Field control for material requests.
*& Moves the logic of /INOWITS/MDM_CONFIG SET_CONFIG (application 'M') into a class
*& that needs no Web Dynpro context, so the Gateway and the validator can call it.
*&
*& Source of the rules (read from the existing code and data):
*&  1. /INOWITS/MDM_MCN, rows of the highest version for the material type.
*&     Flags: HD, DSPLY (display only), RQR (required), COL_FLAG (L or R column).
*&  2. /INOWITS/MM_FELD overrides, only if the user has a department in /INOWITS/USR_DEP
*&     and MM_FELD has rows for application type S, the workflow level, the department
*&     and the material type. Then, per screen, only the fields listed there stay shown,
*&     with required and display-only taken from MM_FELD. Fields whose name contains
*&     'H_' are skipped by the override, as in the existing code.
*&
*& ASSUMPTION to confirm with a test: HD = 'X' means "the field is shown". The column
*& name suggests "hide", but 95 percent of the required fields carry X. Change
*& gc_hd_means_shown if the test shows the opposite.
*&
*& NOT COMPILED. Check the data element names in SE11 (view name, field name, level).
*&---------------------------------------------------------------------*
CLASS zcl_mm_mdm_field_control DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_item,
             view_name    TYPE c LENGTH 30,
             entity       TYPE c LENGTH 30,
             field        TYPE c LENGTH 30,
             shown        TYPE abap_bool,
             display_only TYPE abap_bool,
             required     TYPE abap_bool,
             column       TYPE c LENGTH 1,
             source       TYPE c LENGTH 10,
           END OF ty_item,
           tt_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.

    CONSTANTS gc_app_type TYPE c LENGTH 1 VALUE 'S'.            "domain /INOWITS/APP_TYPE: S = Material
    CONSTANTS gc_hd_means_shown TYPE abap_bool VALUE abap_true.  "see assumption above

    CLASS-METHODS get
      IMPORTING iv_mtart       TYPE mtart
                iv_level       TYPE /inowits/wf_level
                iv_user        TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rt_item) TYPE tt_item.

    "Entity name of the OData model for a view (by the prefix of the view name)
    CLASS-METHODS entity_of_view
      IMPORTING iv_view          TYPE csequence
      RETURNING VALUE(rv_entity) TYPE string.

ENDCLASS.

CLASS zcl_mm_mdm_field_control IMPLEMENTATION.

  METHOD get.
    DATA lv_vrsn TYPE /inowits/mdm_mcn-vrsn.

    "Highest version for this material type (version 0 is valid, so no initial check)
    SELECT SINGLE MAX( vrsn ) FROM /inowits/mdm_mcn
      INTO @lv_vrsn
      WHERE matrltyp = @iv_mtart.

    SELECT vwnm, fnm, hd, dsply, rqr, col_flag, cnt
      FROM /inowits/mdm_mcn
      WHERE matrltyp = @iv_mtart
        AND vrsn     = @lv_vrsn
      INTO TABLE @DATA(lt_cfg).
    CHECK lt_cfg IS NOT INITIAL.
    SORT lt_cfg BY vwnm cnt.

    "Department of the user, then the overrides for level and material type
    DATA lt_feld TYPE STANDARD TABLE OF /inowits/mm_feld WITH DEFAULT KEY.
    SELECT SINGLE dept FROM /inowits/usr_dep INTO @DATA(lv_dept) WHERE bname = @iv_user.
    IF sy-subrc = 0.
      SELECT * FROM /inowits/mm_feld
        WHERE app_type = @gc_app_type
          AND lvl      = @iv_level
          AND dept     = @lv_dept
          AND mtart    = @iv_mtart
        INTO TABLE @lt_feld.
    ENDIF.

    LOOP AT lt_cfg ASSIGNING FIELD-SYMBOL(<c>).
      DATA(ls_item) = VALUE ty_item(
        view_name    = <c>-vwnm
        entity       = entity_of_view( <c>-vwnm )
        field        = <c>-fnm
        shown        = COND #( WHEN gc_hd_means_shown = abap_true THEN xsdbool( <c>-hd = 'X' ) ELSE xsdbool( <c>-hd <> 'X' ) )
        display_only = xsdbool( <c>-dsply = 'X' )
        required     = xsdbool( <c>-rqr = 'X' )
        column       = <c>-col_flag
        source       = COND #( WHEN <c>-vwnm IS INITIAL THEN 'general' ELSE 'view' ) ).

      IF lt_feld IS NOT INITIAL AND <c>-fnm NS 'H_'.
        READ TABLE lt_feld ASSIGNING FIELD-SYMBOL(<o>) WITH KEY fnm = <c>-fnm.
        IF sy-subrc = 0.
          ls_item-shown        = abap_true.
          ls_item-required     = xsdbool( <o>-rqr = 'X' ).
          ls_item-display_only = xsdbool( <o>-dsply = 'X' ).
        ELSE.
          ls_item-shown = abap_false.
        ENDIF.
      ENDIF.
      APPEND ls_item TO rt_item.
    ENDLOOP.
  ENDMETHOD.

  METHOD entity_of_view.
    DATA(lv_pre) = substring_before( val = |{ iv_view }_| sub = '_' ).
    rv_entity = SWITCH #( lv_pre
      WHEN 'MARA' THEN 'Material'  WHEN 'MARC' THEN 'Plant'      WHEN 'MBEW' THEN 'Valuation'
      WHEN 'MVKE' THEN 'SalesOrg'  WHEN 'MARM' THEN 'UnitOfMeasure' WHEN 'MEAN' THEN 'EanData'
      WHEN 'MLGN' THEN 'WarehouseData' WHEN 'MLGT' THEN 'StorageTypeData' WHEN 'QMAT' THEN 'InspectionType'
      WHEN 'PROP' THEN 'ForecastParameter' WHEN 'RMCL' THEN 'ClassCharacteristic' WHEN 'TEXT' THEN 'LongText'
      WHEN 'ST'   THEN 'StorageLocation' WHEN 'PLNT' THEN 'Plant'
      ELSE '' ).
  ENDMETHOD.

ENDCLASS.
