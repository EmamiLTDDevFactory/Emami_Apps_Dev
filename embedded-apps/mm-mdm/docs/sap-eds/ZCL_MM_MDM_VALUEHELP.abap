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



CLASS ZCL_MM_MDM_VALUEHELP IMPLEMENTATION.


  METHOD filter_value.
    LOOP AT it_filter INTO DATA(ls) WHERE name IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-name ) = zcl_mm_mdm_naming=>norm( iv_name ).
        rv_value = ls-value. RETURN.
      ENDIF.
    ENDLOOP.
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
          APPEND VALUE #( item_key = ls_v-domvalue_l item_text = ls_v-ddtext ) TO rt_item.
        ENDLOOP.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD get.
    DATA(lv_name) = to_upper( CONV string( iv_name ) ).
    CASE lv_name.

      WHEN 'MTART'.   "material types that have a field configuration (the 13 types of /INOWITS/MDM_MCN)
        SELECT DISTINCT c~matrltyp AS item_key, t~mtbez AS item_text
          FROM /inowits/mdm_mcn AS c
          LEFT OUTER JOIN t134t AS t ON t~mtart = c~matrltyp AND t~spras = @sy-langu
          ORDER BY c~matrltyp INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MBRSH'.
        SELECT mbrsh AS item_key, mbbez AS item_text FROM t137t WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'WERKS'.
        SELECT werks AS item_key, name1 AS item_text FROM t001w ORDER BY werks INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'LGORT'.
        DATA(lv_werks) = to_upper( filter_value( it_filter = it_filter iv_name = 'WERKS' ) ).
        IF lv_werks IS NOT INITIAL.
          SELECT lgort AS item_key, lgobe AS item_text FROM t001l WHERE werks = @lv_werks ORDER BY lgort INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ELSE.
          SELECT DISTINCT lgort AS item_key, lgobe AS item_text FROM t001l ORDER BY lgort INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ENDIF.

      WHEN 'VKORG'.
        SELECT vkorg AS item_key, vtext AS item_text FROM tvkot WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'VTWEG'.
        DATA(lv_vkorg) = to_upper( filter_value( it_filter = it_filter iv_name = 'VKORG' ) ).
        IF lv_vkorg IS NOT INITIAL.
          SELECT t~vtweg AS item_key, t~vtext AS item_text FROM tvkov AS v
            INNER JOIN tvtwt AS t ON t~vtweg = v~vtweg AND t~spras = @sy-langu
            WHERE v~vkorg = @lv_vkorg ORDER BY t~vtweg INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ELSE.
          SELECT vtweg AS item_key, vtext AS item_text FROM tvtwt WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ENDIF.

      WHEN 'SPART'.
        SELECT spart AS item_key, vtext AS item_text FROM tspat WHERE spras = @sy-langu ORDER BY spart INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'LGNUM'.     "warehouse numbers of the plant (and storage location when given)
        DATA(lv_wk) = to_upper( filter_value( it_filter = it_filter iv_name = 'WERKS' ) ).
        IF lv_wk IS NOT INITIAL.
          SELECT DISTINCT w~lgnum AS item_key, t~lnumt AS item_text FROM t320 AS w
            LEFT OUTER JOIN t300t AS t ON t~lgnum = w~lgnum AND t~spras = @sy-langu
            WHERE w~werks = @lv_wk ORDER BY w~lgnum INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ELSE.
          SELECT DISTINCT w~lgnum AS item_key, t~lnumt AS item_text FROM t320 AS w
            LEFT OUTER JOIN t300t AS t ON t~lgnum = w~lgnum AND t~spras = @sy-langu
            ORDER BY w~lgnum INTO CORRESPONDING FIELDS OF TABLE @rt_item.
        ENDIF.

      WHEN 'LGTYP'.     "storage types of the warehouse
        DATA(lv_ln) = to_upper( filter_value( it_filter = it_filter iv_name = 'LGNUM' ) ).
        SELECT y~lgtyp AS item_key, t~ltypt AS item_text FROM t301 AS y
          LEFT OUTER JOIN t301t AS t ON t~lgnum = y~lgnum AND t~lgtyp = y~lgtyp AND t~spras = @sy-langu
          WHERE y~lgnum = @lv_ln ORDER BY y~lgtyp INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'DOCTYPE'.   "attachment document types of the material type; the mandatory ones are marked in the text
        DATA(lv_dtm) = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        SELECT doc_type AS item_key, doc_desc AS item_text, mandatory FROM /inowits/p_doc_t
          WHERE app_name = 'MC' ORDER BY doc_type
          INTO TABLE @DATA(lt_dt).
        DELETE ADJACENT DUPLICATES FROM lt_dt COMPARING item_key.
        LOOP AT lt_dt ASSIGNING FIELD-SYMBOL(<dt>).
          APPEND VALUE #( item_key = <dt>-item_key
                          item_text = COND #( WHEN <dt>-mandatory = 'X' AND ( lv_dtm = 'VERP' OR lv_dtm = 'PKGN' ) THEN |{ COND string( WHEN <dt>-item_text IS NOT INITIAL THEN <dt>-item_text ELSE <dt>-item_key ) } (required)|
                                              ELSE <dt>-item_text ) ) TO rt_item.
        ENDLOOP.

      WHEN 'MEINS' OR 'GEWEI' OR 'VOLEH'.
        SELECT msehi AS item_key, msehl AS item_text FROM t006a WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MATKL'.
        SELECT matkl AS item_key, wgbez AS item_text FROM t023t WHERE spras = @sy-langu INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'MGRP'.    "description hierarchy, level 1
        DATA(lv_mtart) = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        SELECT mgrpid AS item_key, mgrpdes AS item_text FROM /inowits/mm_mgrp WHERE mtart = @lv_mtart ORDER BY mgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'SGRP'.
        lv_mtart = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        DATA(lv_mg) = filter_value( it_filter = it_filter iv_name = 'MGRPID' ).
        lv_mg = |{ lv_mg ALPHA = IN }|.
        SELECT sgrpid AS item_key, sgrpdes AS item_text FROM /inowits/mm_sgrp WHERE mtart = @lv_mtart AND mgrpid = @lv_mg ORDER BY sgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN 'SSGR'.
        lv_mtart = to_upper( filter_value( it_filter = it_filter iv_name = 'MTART' ) ).
        lv_mg = |{ filter_value( it_filter = it_filter iv_name = 'MGRPID' ) ALPHA = IN }|.
        DATA(lv_sg) = |{ filter_value( it_filter = it_filter iv_name = 'SGRPID' ) ALPHA = IN }|.
        SELECT ssgrpid AS item_key, ssgrpdes AS item_text FROM /inowits/mm_ssgr
          WHERE mtart = @lv_mtart AND mgrpid = @lv_mg AND sgrpid = @lv_sg ORDER BY ssgrpid INTO CORRESPONDING FIELDS OF TABLE @rt_item.

      WHEN OTHERS.
        "Any other field name: fixed values of its domain (the 147 fields with fixed values), else nothing.
        "Check tables (22 in use) and the 29 custom OVS lists are added here one by one when their logic is moved.
        rt_item = from_domain_of_field( lv_name ).
    ENDCASE.
  ENDMETHOD.
ENDCLASS.