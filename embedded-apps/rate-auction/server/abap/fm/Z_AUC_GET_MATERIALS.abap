*&---------------------------------------------------------------------*
*& Function module Z_AUC_GET_MATERIALS
*& Attributes: Remote-Enabled Module
*& Import:  IV_MTART TYPE MTART
*&          IV_SPRAS TYPE SPRAS   DEFAULT 'E'  (optional)
*&          IV_MAX   TYPE I       DEFAULT 500  (optional)
*& Tables:  ET_MATERIALS LIKE ZAUC_S_MATERIAL
*&---------------------------------------------------------------------*
  TYPES: BEGIN OF ty_row,
           matnr TYPE mara-matnr,
           meins TYPE mara-meins,
           maktx TYPE makt-maktx,
         END OF ty_row.
  DATA: lt_row TYPE STANDARD TABLE OF ty_row,
        ls_row TYPE ty_row.

  REFRESH et_materials.
  SELECT a~matnr a~meins b~maktx
    INTO TABLE lt_row UP TO iv_max ROWS
    FROM mara AS a INNER JOIN makt AS b ON b~matnr = a~matnr
    WHERE a~mtart = iv_mtart
      AND a~lvorm = space              " not flagged for deletion
      AND b~spras = iv_spras
    ORDER BY a~matnr.

  LOOP AT lt_row INTO ls_row.
    CLEAR et_materials.
    et_materials-mtart = iv_mtart.
    et_materials-maktx = ls_row-maktx.
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_OUTPUT'
      EXPORTING input  = ls_row-matnr
      IMPORTING output = et_materials-matnr.
    CALL FUNCTION 'CONVERSION_EXIT_CUNIT_OUTPUT'
      EXPORTING input    = ls_row-meins
                language = 'E'          " fixed, so the Node.js unit map is stable
      IMPORTING output   = et_materials-meins.
    APPEND et_materials.
  ENDLOOP.
