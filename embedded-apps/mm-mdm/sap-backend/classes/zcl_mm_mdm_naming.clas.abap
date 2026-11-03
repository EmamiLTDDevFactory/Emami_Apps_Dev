"! Names: entity and entity set to staging table, property name to ABAP field name and back.
"! One place for everything the generic Gateway code needs to know about the model.
CLASS zcl_mm_mdm_naming DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_entity,
             entity TYPE string,                 "OData entity type, for example Material
             set    TYPE string,                 "entity set, for example MaterialSet
             table  TYPE tabname,                "staging table
             multi  TYPE abap_bool,              "several rows per request
             keys   TYPE string_table,           "key fields besides MANDT and TRANSID (ABAP names)
           END OF ty_entity,
           tt_entity TYPE STANDARD TABLE OF ty_entity WITH DEFAULT KEY.

    CLASS-METHODS entities RETURNING VALUE(rt_entity) TYPE tt_entity.
    CLASS-METHODS by_set     IMPORTING iv_set TYPE csequence RETURNING VALUE(rs_entity) TYPE ty_entity.
    CLASS-METHODS is_staging IMPORTING iv_set TYPE csequence RETURNING VALUE(rv_yes) TYPE abap_bool.

    "MTART to Mtart, SR_NO to SrNo
    CLASS-METHODS to_prop IMPORTING iv_name TYPE csequence RETURNING VALUE(rv_prop) TYPE string.
    "Mtart to MTART, SrNo to SR_NO
    CLASS-METHODS to_name IMPORTING iv_prop TYPE csequence RETURNING VALUE(rv_name) TYPE string.
    "Comparison key that ignores case and underscores (TransId, TRANS_ID and TRANSID are equal)
    CLASS-METHODS norm    IMPORTING iv_name TYPE csequence RETURNING VALUE(rv_norm) TYPE string.

    CLASS-METHODS pad_transid IMPORTING iv_transid TYPE csequence RETURNING VALUE(rv_transid) TYPE /inowits/transid.

    "Tables of one request that the draft delete clears. The first 18 are the ones the Web Dynpro delete clears.
    CLASS-METHODS delete_tables RETURNING VALUE(rt_table) TYPE string_table.

    "Entity of a view name, by prefix (MARA_BASIC1 gives Material)
    CLASS-METHODS entity_of_view IMPORTING iv_view TYPE csequence RETURNING VALUE(rv_entity) TYPE string.

ENDCLASS.

CLASS zcl_mm_mdm_naming IMPLEMENTATION.

  METHOD entities.
    rt_entity = VALUE #(
      ( entity = 'Material'            set = 'MaterialSet'            table = '/INOWITS/MM_MARA' )
      ( entity = 'Description'         set = 'DescriptionSet'         table = '/INOWITS/MM_MAKT' )
      ( entity = 'Plant'               set = 'PlantSet'               table = '/INOWITS/MM_MARC' )
      ( entity = 'SalesOrg'            set = 'SalesOrgSet'            table = '/INOWITS/MM_MVKE' )
      ( entity = 'Valuation'           set = 'ValuationSet'           table = '/INOWITS/MM_MBEW' )
      ( entity = 'StorageLocation'     set = 'StorageLocationSet'     table = '/INOWITS/MM_MARD' )
      ( entity = 'WarehouseData'       set = 'WarehouseDataSet'       table = '/INOWITS/MM_MLGN' )
      ( entity = 'StorageTypeData'     set = 'StorageTypeDataSet'     table = '/INOWITS/MM_MLGT' )
      ( entity = 'EanData'             set = 'EanDataSet'             table = '/INOWITS/MM_MEAN' )
      ( entity = 'ForecastParameter'   set = 'ForecastParameterSet'   table = '/INOWITS/MM_PROP' )
      ( entity = 'UnitOfMeasure'       set = 'UnitOfMeasureSet'       table = '/INOWITS/MM_MARM' multi = abap_true keys = VALUE #( ( `MEINH` ) ) )
      ( entity = 'TaxClassification'   set = 'TaxClassificationSet'   table = '/INOWITS/MM_MLAN' multi = abap_true keys = VALUE #( ( `ALAND` ) ) )
      ( entity = 'SalesTaxData'        set = 'SalesTaxDataSet'        table = '/INOWITS/MM_STAX' multi = abap_true keys = VALUE #( ( `SR_NO` ) ) )
      ( entity = 'InspectionType'      set = 'InspectionTypeSet'      table = '/INOWITS/MM_QMAT' multi = abap_true keys = VALUE #( ( `SERIAL_NO` ) ) )
      ( entity = 'ClassCharacteristic' set = 'ClassCharacteristicSet' table = '/INOWITS/MM_RMCL' multi = abap_true keys = VALUE #( ( `SR_NO` ) ) )
      ( entity = 'ProductionVersion'   set = 'ProductionVersionSet'   table = '/INOWITS/MM_MKAL' multi = abap_true keys = VALUE #( ( `SLNO` ) ) )
      ( entity = 'ConsumptionData'     set = 'ConsumptionDataSet'     table = '/INOWITS/MM_CONS' multi = abap_true keys = VALUE #( ( `PRIOD` ) ) )
      ( entity = 'LongText'            set = 'LongTextSet'            table = '/INOWITS/MM_TEXT' multi = abap_true keys = VALUE #( ( `MATNR` ) ( `FID` ) ) )
      ( entity = 'ViewSelection'       set = 'ViewSelectionSet'       table = '/INOWITS/M_VWSEL' ) ).
  ENDMETHOD.

  METHOD by_set.
    DATA(lt) = entities( ).
    READ TABLE lt INTO rs_entity WITH KEY set = iv_set.
  ENDMETHOD.

  METHOD is_staging.
    DATA(lt) = entities( ).
    rv_yes = xsdbool( line_exists( lt[ set = iv_set ] ) ).
  ENDMETHOD.

  METHOD to_prop.
    SPLIT iv_name AT '_' INTO TABLE DATA(lt_part).
    LOOP AT lt_part INTO DATA(lv_part) WHERE table_line IS NOT INITIAL.
      DATA(lv_low) = to_lower( lv_part ).
      rv_prop = rv_prop && to_upper( substring( val = lv_low off = 0 len = 1 ) ) && substring( val = lv_low off = 1 ).
    ENDLOOP.
  ENDMETHOD.

  METHOD to_name.
    rv_name = iv_prop.
    REPLACE ALL OCCURRENCES OF REGEX '([a-z0-9])([A-Z])' IN rv_name WITH '$1_$2'.
    rv_name = to_upper( rv_name ).
  ENDMETHOD.

  METHOD norm.
    rv_norm = to_upper( iv_name ).
    REPLACE ALL OCCURRENCES OF '_' IN rv_norm WITH ''.
  ENDMETHOD.

  METHOD pad_transid.
    DATA lv_in TYPE string.
    lv_in = iv_transid.
    CONDENSE lv_in.
    rv_transid = |{ lv_in ALPHA = IN }|.
  ENDMETHOD.

  METHOD delete_tables.
    rt_table = VALUE #(
      "cleared by the Web Dynpro delete (V_DISPLAY.ONACTIONYES_DELETE)
      ( `/INOWITS/MM_MARA` ) ( `/INOWITS/MM_MARC` ) ( `/INOWITS/MM_MARD` ) ( `/INOWITS/MM_MVKE` ) ( `/INOWITS/MM_PROP` )
      ( `/INOWITS/MM_DRAW` ) ( `/INOWITS/MM_MAKT` ) ( `/INOWITS/MM_MARM` ) ( `/INOWITS/MM_MBEW` ) ( `/INOWITS/MM_MKAL` )
      ( `/INOWITS/MM_MLAN` ) ( `/INOWITS/MM_MLGN` ) ( `/INOWITS/MM_MLGT` ) ( `/INOWITS/MM_PROW` ) ( `/INOWITS/MM_QMAT` )
      ( `/INOWITS/MM_RMCL` ) ( `/INOWITS/MM_TEXT` )
      "left behind by the Web Dynpro delete; cleared here as well (deliberate difference, to confirm)
      ( `/INOWITS/M_VWSEL` ) ( `/INOWITS/TRANS_I` ) ( `/INOWITS/MM_MEAN` ) ( `/INOWITS/MM_STAX` ) ( `/INOWITS/MM_CONS` )
      ( `/INOWITS/MM_MAEX` ) ( `/INOWITS/MM_MAPE` ) ( `/INOWITS/MM_WRPL` ) ( `/INOWITS/MM_MCHA` ) ( `/INOWITS/MM_MAPR` )
      ( `/INOWITS/MM_MVER` ) ).
    "To review once their structures are known: CM_META, MM_EXSE, MM_WS_V, MM_PRO, MASS_PL, MASS_SL, PH_D_M.
  ENDMETHOD.

  METHOD entity_of_view.
    DATA(lv_pre) = substring_before( val = |{ iv_view }_| sub = '_' ).
    rv_entity = SWITCH #( lv_pre
      WHEN 'MARA' THEN 'Material'          WHEN 'MARC' THEN 'Plant'              WHEN 'MBEW' THEN 'Valuation'
      WHEN 'MVKE' THEN 'SalesOrg'          WHEN 'MARM' THEN 'UnitOfMeasure'      WHEN 'MEAN' THEN 'EanData'
      WHEN 'MLGN' THEN 'WarehouseData'     WHEN 'MLGT' THEN 'StorageTypeData'    WHEN 'QMAT' THEN 'InspectionType'
      WHEN 'PROP' THEN 'ForecastParameter' WHEN 'RMCL' THEN 'ClassCharacteristic' WHEN 'TEXT' THEN 'LongText'
      WHEN 'ST'   THEN 'StorageLocation'   WHEN 'PLNT' THEN 'Plant'
      ELSE '' ).
  ENDMETHOD.

ENDCLASS.
