"! Generic access to the staging tables of a request. One implementation for all 18 entities,
"! driven by ZCL_MM_MDM_NAMING. The Gateway classes never name a staging table themselves.
CLASS zcl_mm_mdm_staging DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    "Rows of one request as a table of the staging table line type
    CLASS-METHODS read_rows
      IMPORTING iv_set          TYPE csequence
                iv_transid      TYPE zif_mm_mdm_types=>ty_transid
      RETURNING VALUE(rr_table) TYPE REF TO data.

    "One row by key (key values: ABAP field name and value)
    CLASS-METHODS read_row
      IMPORTING iv_set        TYPE csequence
                iv_transid    TYPE zif_mm_mdm_types=>ty_transid
                it_key        TYPE /iwbep/t_mgw_name_value_pair OPTIONAL
      RETURNING VALUE(rr_row) TYPE REF TO data.

    "Insert or change a row from an entity structure. Fields the entity does not carry keep their stored value.
    CLASS-METHODS merge_row
      IMPORTING iv_set     TYPE csequence
                iv_transid TYPE zif_mm_mdm_types=>ty_transid
                is_entity  TYPE any.

    CLASS-METHODS delete_row
      IMPORTING iv_set     TYPE csequence
                iv_transid TYPE zif_mm_mdm_types=>ty_transid
                it_key     TYPE /iwbep/t_mgw_name_value_pair.

    "Insert a row built from name and value pairs (used when a request is started)
    CLASS-METHODS put_row
      IMPORTING iv_table   TYPE tabname
                iv_transid TYPE zif_mm_mdm_types=>ty_transid
                it_value   TYPE /iwbep/t_mgw_name_value_pair.

    "Copy fields by name. Names match when they are equal ignoring case and underscores
    "(TRANSID, TRANS_ID and TransId are the same field), so the Gateway field names need not equal the table field names.
    CLASS-METHODS copy_by_name
      IMPORTING is_source TYPE any
      CHANGING  cs_target TYPE any.

    "Set one component of a structure by property name (for derived properties such as Level or MaterialType)
    CLASS-METHODS set_by_prop
      IMPORTING iv_prop TYPE csequence
                iv_value TYPE any
      CHANGING  cs_target TYPE any.

    "Reference to a component found by name (ignoring case and underscores); initial if there is none
    CLASS-METHODS comp_ref
      IMPORTING is_data       TYPE any
                iv_name       TYPE csequence
      RETURNING VALUE(rr_ref) TYPE REF TO data.

  PRIVATE SECTION.
    CLASS-METHODS where_for
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                it_key     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rv_where) TYPE string.
ENDCLASS.

CLASS zcl_mm_mdm_staging IMPLEMENTATION.

  METHOD read_rows.
    DATA(ls_ent) = zcl_mm_mdm_naming=>by_set( iv_set ).
    CHECK ls_ent-table IS NOT INITIAL.
    CREATE DATA rr_table TYPE STANDARD TABLE OF (ls_ent-table) WITH DEFAULT KEY.
    ASSIGN rr_table->* TO FIELD-SYMBOL(<tab>).
    SELECT * FROM (ls_ent-table) WHERE transid = @iv_transid INTO TABLE @<tab>.
  ENDMETHOD.

  METHOD read_row.
    DATA(ls_ent) = zcl_mm_mdm_naming=>by_set( iv_set ).
    CHECK ls_ent-table IS NOT INITIAL.
    CREATE DATA rr_row TYPE (ls_ent-table).
    ASSIGN rr_row->* TO FIELD-SYMBOL(<row>).
    DATA(lv_where) = where_for( iv_transid = iv_transid it_key = it_key ).
    SELECT SINGLE * FROM (ls_ent-table) WHERE (lv_where) INTO @<row>.
    IF sy-subrc <> 0.
      CLEAR rr_row.
    ENDIF.
  ENDMETHOD.

  METHOD merge_row.
    DATA(ls_ent) = zcl_mm_mdm_naming=>by_set( iv_set ).
    CHECK ls_ent-table IS NOT INITIAL.
    DATA lr_db TYPE REF TO data.
    CREATE DATA lr_db TYPE (ls_ent-table).
    ASSIGN lr_db->* TO FIELD-SYMBOL(<db>).

    "key values of the entity
    DATA lt_key TYPE /iwbep/t_mgw_name_value_pair.
    LOOP AT ls_ent-keys INTO DATA(lv_key).
      DATA(lr_k) = comp_ref( is_data = is_entity iv_name = lv_key ).
      IF lr_k IS BOUND.
        ASSIGN lr_k->* TO FIELD-SYMBOL(<k>).
        APPEND VALUE #( name = lv_key value = |{ <k> }| ) TO lt_key.
      ENDIF.
    ENDLOOP.

    DATA(lv_where) = where_for( iv_transid = iv_transid it_key = lt_key ).
    SELECT SINGLE * FROM (ls_ent-table) WHERE (lv_where) INTO @<db>.       "keeps fields the entity does not carry
    copy_by_name( EXPORTING is_source = is_entity CHANGING cs_target = <db> ).
    ASSIGN COMPONENT 'TRANSID' OF STRUCTURE <db> TO FIELD-SYMBOL(<t>).
    IF sy-subrc = 0. <t> = iv_transid. ENDIF.
    MODIFY (ls_ent-table) FROM @<db>.
  ENDMETHOD.

  METHOD delete_row.
    DATA(ls_ent) = zcl_mm_mdm_naming=>by_set( iv_set ).
    CHECK ls_ent-table IS NOT INITIAL.
    DATA(lv_where) = where_for( iv_transid = iv_transid it_key = it_key ).
    DELETE FROM (ls_ent-table) WHERE (lv_where).
  ENDMETHOD.

  METHOD put_row.
    DATA lr TYPE REF TO data.
    CREATE DATA lr TYPE (iv_table).
    ASSIGN lr->* TO FIELD-SYMBOL(<row>).
    LOOP AT it_value INTO DATA(ls_v).
      ASSIGN COMPONENT ls_v-name OF STRUCTURE <row> TO FIELD-SYMBOL(<f>).
      IF sy-subrc = 0. <f> = ls_v-value. ENDIF.
    ENDLOOP.
    ASSIGN COMPONENT 'TRANSID' OF STRUCTURE <row> TO FIELD-SYMBOL(<t>).
    IF sy-subrc = 0. <t> = iv_transid. ENDIF.
    MODIFY (iv_table) FROM @<row>.
  ENDMETHOD.

  METHOD copy_by_name.
    TYPES: BEGIN OF ty_pair, norm TYPE string, name TYPE string, END OF ty_pair.
    DATA lt_src TYPE HASHED TABLE OF ty_pair WITH UNIQUE KEY norm.
    DATA(lo_s) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( is_source ) ).
    LOOP AT lo_s->components INTO DATA(ls_sc).
      INSERT VALUE #( norm = zcl_mm_mdm_naming=>norm( ls_sc-name ) name = ls_sc-name ) INTO TABLE lt_src.
    ENDLOOP.
    DATA(lo_t) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( cs_target ) ).
    LOOP AT lo_t->components INTO DATA(ls_c).
      READ TABLE lt_src INTO DATA(ls_hit) WITH TABLE KEY norm = zcl_mm_mdm_naming=>norm( ls_c-name ).
      CHECK sy-subrc = 0.
      ASSIGN COMPONENT ls_hit-name OF STRUCTURE is_source TO FIELD-SYMBOL(<s>).
      CHECK sy-subrc = 0.
      ASSIGN COMPONENT ls_c-name OF STRUCTURE cs_target TO FIELD-SYMBOL(<d>).
      CHECK sy-subrc = 0.
      <d> = <s>.
    ENDLOOP.
  ENDMETHOD.

  METHOD set_by_prop.
    DATA(lo_t) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( cs_target ) ).
    DATA(lv_norm) = zcl_mm_mdm_naming=>norm( iv_prop ).
    LOOP AT lo_t->components INTO DATA(ls_c).
      IF zcl_mm_mdm_naming=>norm( ls_c-name ) = lv_norm.
        ASSIGN COMPONENT ls_c-name OF STRUCTURE cs_target TO FIELD-SYMBOL(<d>).
        IF sy-subrc = 0. <d> = iv_value. ENDIF.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD comp_ref.
    DATA(lo_s) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( is_data ) ).
    DATA(lv_norm) = zcl_mm_mdm_naming=>norm( iv_name ).
    LOOP AT lo_s->components INTO DATA(ls_c).
      IF zcl_mm_mdm_naming=>norm( ls_c-name ) = lv_norm.
        ASSIGN COMPONENT ls_c-name OF STRUCTURE is_data TO FIELD-SYMBOL(<f>).
        IF sy-subrc = 0. rr_ref = REF #( <f> ). ENDIF.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD where_for.
    rv_where = |TRANSID = { cl_abap_dyn_prg=>quote( iv_transid ) }|.
    LOOP AT it_key INTO DATA(ls_k) WHERE name IS NOT INITIAL.
      DATA(lv_name) = zcl_mm_mdm_naming=>to_name( ls_k-name ).
      CHECK lv_name <> 'TRANSID' AND lv_name <> 'APPID' AND lv_name <> 'APP_ID'.
      rv_where = |{ rv_where } AND { lv_name } = { cl_abap_dyn_prg=>quote( ls_k-value ) }|.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
