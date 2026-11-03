"! Value helps for the front end. Standard lists by name, the description hierarchy, fixed values and check tables.
CLASS zcl_mm_mdm_valuehelp DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    "Filter: name and value pairs, for example MTART, MGRPID, SGRPID, WERKS
    CLASS-METHODS get
      IMPORTING iv_name        TYPE csequence
                it_filter      TYPE /iwbep/t_mgw_name_value_pair OPTIONAL
      RETURNING VALUE(rt_item) TYPE zif_mm_mdm_types=>tt_item.

  PRIVATE SECTION.
    CLASS-METHODS filter_value
      IMPORTING it_filter       TYPE /iwbep/t_mgw_name_value_pair
                iv_name         TYPE csequence
      RETURNING VALUE(rv_value) TYPE string.

    CLASS-METHODS from_domain_of_field
      IMPORTING iv_field       TYPE csequence
      RETURNING VALUE(rt_item) TYPE zif_mm_mdm_types=>tt_item.
ENDCLASS.

CLASS zcl_mm_mdm_valuehelp IMPLEMENTATION.

  METHOD filter_value.
    LOOP AT it_filter INTO DATA(ls) WHERE name IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-name ) = zcl_mm_mdm_naming=>norm( iv_name ).
        rv_value = ls-value. RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD get.
    DATA(lv_name) = to_upper( CONV string( iv_name ) ).
    CASE lv_name.

      WHEN 'MTART'.   "material types that have a field configuration (the 13 types of /INOWITS/MDM_MCN)
        SELECT DISTINCT c~matrltyp AS key, t~mtbez AS text
          FROM /inowits/mdm_mcn AS c
          LEFT OUTER JOIN t134t AS t ON t~mtart = c~matrltyp AND t~spras = @sy-langu
          ORDER BY c~matrltyp INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MBRSH'.
        SELECT mbrsh AS key, mbbez AS text FROM t137t WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'WERKS'.
        SELECT werks AS key, name1 AS text FROM t001w ORDER BY werks INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'LGORT'.
        DATA(lv_werks) = to_upper( filter_value( it_filter = it_filter iv_name = 'WERKS' ) ).
        IF lv_werks IS NOT INITIAL.
          SELECT lgort AS key, lgobe AS text FROM t001l WHERE werks = @lv_werks ORDER BY lgort INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ELSE.
          SELECT DISTINCT lgort AS key, lgobe AS text FROM t001l ORDER BY lgort INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ENDIF.

      WHEN 'VKORG'.
        SELECT vkorg AS key, vtext AS text FROM tvkot WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'VTWEG'.
        SELECT vtweg AS key, vtext AS text FROM tvtwt WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MEINS' OR 'GEWEI' OR 'VOLEH'.
        SELECT msehi AS key, msehl AS text FROM t006a WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MATKL'.
        SELECT matkl AS key, wgbez AS text FROM t023t WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MGRP'.    "description hierarchy, level 1
        DATA(lv_mtart) = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        SELECT mgrpid AS key, mgrpdes AS text FROM /inowits/mm_mgrp WHERE mtart = @lv_mtart ORDER BY mgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'SGRP'.
        lv_mtart = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        DATA(lv_mg) = filter_value( it_filter = it_filter iv_name = 'MGRPID' ).
        lv_mg = |{ lv_mg ALPHA = IN }|.
        SELECT sgrpid AS key, sgrpdes AS text FROM /inowits/mm_sgrp WHERE mtart = @lv_mtart AND mgrpid = @lv_mg ORDER BY sgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'SSGR'.
        lv_mtart = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        lv_mg = |{ filter_value( it_filter = it_filter iv_name = 'MGRPID' ) ALPHA = IN }|.
        DATA(lv_sg) = |{ filter_value( it_filter = it_filter iv_name = 'SGRPID' ) ALPHA = IN }|.
        SELECT ssgrpid AS key, ssgrpdes AS text FROM /inowits/mm_ssgr
          WHERE mtart = @lv_mtart AND mgrpid = @lv_mg AND sgrpid = @lv_sg ORDER BY ssgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN OTHERS.
        "Any other field name: fixed values of its domain (the 147 fields with fixed values), else nothing.
        "Check tables (22 in use) and the 29 custom OVS lists are added here one by one when their logic is moved.
        rt_item = from_domain_of_field( lv_name ).
    ENDCASE.
  ENDMETHOD.

  METHOD from_domain_of_field.
    "Domain of the field in the staging tables (MARA first), then its fixed values
    DATA lt_dfies TYPE STANDARD TABLE OF dfies.
    DATA lt_values TYPE STANDARD TABLE OF dd07v.
    LOOP AT VALUE string_table( ( `/INOWITS/MM_MARA` ) ( `/INOWITS/MM_MARC` ) ( `/INOWITS/MM_MVKE` ) ( `/INOWITS/MM_MBEW` ) ) INTO DATA(lv_tab).
      CLEAR lt_dfies.
      CALL FUNCTION 'DDIF_FIELDINFO_GET'
        EXPORTING tabname = CONV tabname( lv_tab ) fieldname = CONV fieldname( iv_field )
        TABLES dfies_tab = lt_dfies EXCEPTIONS not_found = 1 internal_error = 2 OTHERS = 3.
      IF sy-subrc = 0 AND lt_dfies IS NOT INITIAL.
        DATA(lv_dom) = lt_dfies[ 1 ]-domname.
        CHECK lv_dom IS NOT INITIAL.
        CALL FUNCTION 'DD_DOMVALUES_GET'
          EXPORTING domname = lv_dom text = 'X' langu = sy-langu
          TABLES dd07v_tab = lt_values EXCEPTIONS OTHERS = 1.
        LOOP AT lt_values INTO DATA(ls_v) WHERE domvalue_l IS NOT INITIAL.
          APPEND VALUE #( key = ls_v-domvalue_l text = ls_v-ddtext ) TO rt_item.
        ENDLOOP.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
