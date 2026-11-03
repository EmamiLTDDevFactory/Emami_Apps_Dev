"! Validator for material requests, no Web Dynpro context.
"! Moves the rules of the existing app (FIELD_VALIDATION, VALIDATE, the duplicate checks and the generic
"! mandatory check of /INOWITS/CL_WD_DYNAMIC_TOOL) into one class.
"!
"! Inventory: MM_Create_validation_catalogue_v1.xlsx (635 error points) and MM_logic_coverage_matrix.xlsx.
"! Move the rules group by group, keep the texts and the hardcoded values unchanged, and run old and new side by side.
"! Each group is one private method that appends to the message table. Add a group, add it to VALIDATE.
CLASS zcl_mm_mdm_validator DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_level   TYPE /inowits/wf_level DEFAULT 'L0'
                iv_user    TYPE syuname DEFAULT sy-uname.

    "All messages at once. Nothing is stored.
    METHODS validate RETURNING VALUE(rt_msg) TYPE zif_mm_mdm_types=>tt_msg.

    METHODS has_errors
      IMPORTING it_msg        TYPE zif_mm_mdm_types=>tt_msg
      RETURNING VALUE(rv_yes) TYPE abap_bool.

  PRIVATE SECTION.
    DATA mv_transid TYPE zif_mm_mdm_types=>ty_transid.
    DATA mv_level   TYPE /inowits/wf_level.
    DATA mv_user    TYPE syuname.
    DATA mv_mtart   TYPE mtart.
    DATA mt_views   TYPE string_table.                                  "active views (flags of M_VWSEL set to X)
    DATA mt_fc      TYPE zcl_mm_mdm_field_control=>tt_item.

    METHODS load_context.

    "Rule groups. Written: header, weights and numbers, mandatory by configuration.
    "To move from the Web Dynpro code: the groups below, in this order, each with its catalogue rows.
    METHODS rules_header               CHANGING ct_msg TYPE zif_mm_mdm_types=>tt_msg.   "E021, E022, E023
    METHODS rules_weights_and_numbers  CHANGING ct_msg TYPE zif_mm_mdm_types=>tt_msg.   "E027, E055, E063, UFGS E064 and E065
    METHODS rules_mandatory_by_config  CHANGING ct_msg TYPE zif_mm_mdm_types=>tt_msg.   "generic check, see the method
    "TODO rules_plant_existence       existence checks of MARC fields against check tables (MRP, purchasing, costing)
    "TODO rules_sales_existence       existence checks of MVKE fields
    "TODO rules_valuation             MBEW rules
    "TODO rules_units_and_ean         MARM and MEAN rules, units and EAN category
    "TODO rules_quality_and_trade     QMAT, foreign trade
    "TODO rules_classification        RMCL
    "TODO rules_texts_and_tax         TEXT, MLAN, STAX
    "TODO rules_duplicate             duplicate check as a rule (uses ZCL_MM_MDM_FUNCTIONS=>CHECK_DUPLICATE)

    METHODS add
      IMPORTING iv_code   TYPE csequence
                iv_text   TYPE string
                iv_target TYPE string
      CHANGING  ct_msg    TYPE zif_mm_mdm_types=>tt_msg.

    METHODS domain_allows_blank
      IMPORTING iv_rollname   TYPE rollname
      RETURNING VALUE(rv_ok)  TYPE abap_bool.
ENDCLASS.

CLASS zcl_mm_mdm_validator IMPLEMENTATION.

  METHOD constructor.
    mv_transid = iv_transid.
    mv_level   = iv_level.
    mv_user    = iv_user.
  ENDMETHOD.

  METHOD validate.
    load_context( ).
    rules_header( CHANGING ct_msg = rt_msg ).
    rules_weights_and_numbers( CHANGING ct_msg = rt_msg ).
    rules_mandatory_by_config( CHANGING ct_msg = rt_msg ).
  ENDMETHOD.

  METHOD has_errors.
    rv_yes = xsdbool( line_exists( it_msg[ severity = 'E' ] ) ).
  ENDMETHOD.

  METHOD load_context.
    SELECT SINGLE mtart FROM /inowits/mm_mara WHERE transid = @mv_transid INTO @mv_mtart.
    SELECT SINGLE * FROM /inowits/m_vwsel WHERE transid = @mv_transid INTO @DATA(ls_vw).
    "Active views: every component of the row (except MANDT and TRANSID) that has the value X
    DATA(lo_struc) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( ls_vw ) ).
    LOOP AT lo_struc->components INTO DATA(ls_comp) WHERE name <> 'MANDT' AND name <> 'TRANSID'.
      ASSIGN COMPONENT ls_comp-name OF STRUCTURE ls_vw TO FIELD-SYMBOL(<f>).
      IF <f> = 'X'. APPEND CONV string( ls_comp-name ) TO mt_views. ENDIF.
    ENDLOOP.
    mt_fc = zcl_mm_mdm_field_control=>get( iv_mtart = mv_mtart iv_level = CONV #( mv_level ) iv_user = mv_user ).
  ENDMETHOD.

  METHOD rules_header.
    SELECT SINGLE mtart, mbrsh FROM /inowits/mm_mara WHERE transid = @mv_transid INTO @DATA(ls_mara).
    SELECT SINGLE maktx FROM /inowits/mm_makt WHERE transid = @mv_transid INTO @DATA(lv_maktx).
    IF ls_mara-mtart IS INITIAL.
      MESSAGE e022(/inowits/cl_mdm_msg) INTO DATA(lv_t).
      add( EXPORTING iv_code = 'E022' iv_text = lv_t iv_target = 'Material/MTART' CHANGING ct_msg = ct_msg ).
    ENDIF.
    IF ls_mara-mbrsh IS INITIAL.
      MESSAGE e021(/inowits/cl_mdm_msg) INTO lv_t.
      add( EXPORTING iv_code = 'E021' iv_text = lv_t iv_target = 'Material/MBRSH' CHANGING ct_msg = ct_msg ).
    ENDIF.
    IF lv_maktx IS INITIAL.
      MESSAGE e023(/inowits/cl_mdm_msg) INTO lv_t.
      add( EXPORTING iv_code = 'E023' iv_text = lv_t iv_target = 'Description/MAKTX' CHANGING ct_msg = ct_msg ).
    ENDIF.
  ENDMETHOD.

  METHOD rules_weights_and_numbers.
    SELECT SINGLE mtart, ntgew, brgew, ean11, mhdrz, mhdhb FROM /inowits/mm_mara WHERE transid = @mv_transid INTO @DATA(m).
    IF m-ntgew > m-brgew AND m-brgew IS NOT INITIAL.
      MESSAGE e027(/inowits/cl_mdm_msg) INTO DATA(lv_t).
      add( EXPORTING iv_code = 'E027' iv_text = lv_t iv_target = 'Material/NTGEW' CHANGING ct_msg = ct_msg ).
    ENDIF.
    IF m-ean11 IS NOT INITIAL AND m-ean11 CN '0123456789 '.
      MESSAGE e055(/inowits/cl_mdm_msg) INTO lv_t.
      add( EXPORTING iv_code = 'E055' iv_text = lv_t iv_target = 'Material/EAN11' CHANGING ct_msg = ct_msg ).
    ENDIF.
    IF m-mhdrz > m-mhdhb AND m-mhdhb IS NOT INITIAL.
      MESSAGE e063(/inowits/cl_mdm_msg) INTO lv_t.
      add( EXPORTING iv_code = 'E063' iv_text = lv_t iv_target = 'Material/MHDRZ' CHANGING ct_msg = ct_msg ).
    ENDIF.
    "Hardcoded business rule kept as in the existing code (decision)
    IF m-mtart = 'UFGS'.
      IF m-mhdrz <> 100.
        MESSAGE e064(/inowits/cl_mdm_msg) INTO lv_t.
        add( EXPORTING iv_code = 'E064' iv_text = lv_t iv_target = 'Material/MHDRZ' CHANGING ct_msg = ct_msg ).
      ENDIF.
      IF m-mhdhb <> 180.
        MESSAGE e065(/inowits/cl_mdm_msg) INTO lv_t.
        add( EXPORTING iv_code = 'E065' iv_text = lv_t iv_target = 'Material/MHDHB' CHANGING ct_msg = ct_msg ).
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD rules_mandatory_by_config.
    "Same result as /INOWITS/CL_WD_DYNAMIC_TOOL=>CHECK_MANDATORY_ATTR_ON_VIEW for the active views:
    "field shown, editable and required in the field control, value empty, domain does not allow an empty value,
    "never for PLIFZ and STCD4. Text: 'Please enter <data element text>'.
    LOOP AT mt_fc ASSIGNING FIELD-SYMBOL(<fc>)
         WHERE shown = abap_true AND display_only = abap_false AND required = abap_true
           AND field <> 'PLIFZ' AND field <> 'STCD4'.
      IF NOT line_exists( mt_views[ table_line = <fc>-view_name ] ). CONTINUE. ENDIF.
      DATA(lv_entity) = zcl_mm_mdm_naming=>entity_of_view( <fc>-view_name ).
      CHECK lv_entity IS NOT INITIAL.
      DATA(ls_ent) = VALUE zcl_mm_mdm_naming=>ty_entity( ).
      LOOP AT zcl_mm_mdm_naming=>entities( ) INTO DATA(ls_e) WHERE entity = lv_entity.
        ls_ent = ls_e.
      ENDLOOP.
      CHECK ls_ent-table IS NOT INITIAL AND ls_ent-multi = abap_false.     "grids (several rows) are checked by their own groups
      DATA lr_row TYPE REF TO data.
      CREATE DATA lr_row TYPE (ls_ent-table).
      ASSIGN lr_row->* TO FIELD-SYMBOL(<row>).
      SELECT SINGLE * FROM (ls_ent-table) WHERE transid = @mv_transid INTO @<row>.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      ASSIGN COMPONENT <fc>-field OF STRUCTURE <row> TO FIELD-SYMBOL(<val>).
      IF sy-subrc <> 0 OR <val> IS NOT INITIAL. CONTINUE. ENDIF.
      DATA(lo_el) = CAST cl_abap_elemdescr( cl_abap_typedescr=>describe_by_data( <val> ) ).
      DATA(lv_rollname) = CONV rollname( lo_el->get_relative_name( ) ).
      IF domain_allows_blank( lv_rollname ) = abap_true. CONTINUE. ENDIF.
      SELECT SINGLE ddtext FROM dd04t WHERE rollname = @lv_rollname AND ddlanguage = @sy-langu AND as4local = 'A' INTO @DATA(lv_label).
      add( EXPORTING iv_code = 'WD014' iv_text = |Please enter { lv_label }| iv_target = |{ lv_entity }/{ <fc>-field }| CHANGING ct_msg = ct_msg ).
    ENDLOOP.
  ENDMETHOD.

  METHOD domain_allows_blank.
    "Existing behavior: no error when the domain has a fixed value with an empty key, or when its value table has a row with an empty key.
    DATA lt_values TYPE STANDARD TABLE OF dd07v.
    DATA ls_dd04 TYPE dd04v.
    CALL FUNCTION 'DDIF_DTEL_GET' EXPORTING name = iv_rollname langu = sy-langu IMPORTING dd04v_wa = ls_dd04 EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0 OR ls_dd04-domname IS INITIAL. RETURN. ENDIF.
    CALL FUNCTION 'DD_DOMVALUES_GET' EXPORTING domname = ls_dd04-domname text = 'X' langu = sy-langu
      TABLES dd07v_tab = lt_values EXCEPTIONS OTHERS = 1.
    IF line_exists( lt_values[ domvalue_l = '' ] ).
      rv_ok = abap_true.
    ENDIF.
    "Value table check (a blank key row): add after confirming how the existing tool uses it.
  ENDMETHOD.

  METHOD add.
    APPEND VALUE #( code = iv_code message = iv_text severity = 'E' target = iv_target ) TO ct_msg.
  ENDMETHOD.

ENDCLASS.
