"! Change (MX) and extension (ME) of an existing material: find it, read its scope, check that nothing is in flight, and start
"! a request whose staging rows are a copy of the live data. A second copy (the base snapshot, under BASE_ID) lets the poster post
"! only what the requester changed, so newer changes made in SAP in the meantime are not overwritten.
CLASS zcl_mm_mdm_change DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS:
      c_app_change TYPE c LENGTH 6 VALUE 'MX',
      c_app_extend TYPE c LENGTH 6 VALUE 'ME'.

    TYPES:
      BEGIN OF ty_found,
        matnr TYPE matnr,
        maktx TYPE maktx,
        mtart TYPE mtart,
        matkl TYPE matkl,
        meins TYPE meins,
        busy  TYPE abap_bool,        "an open change or extension request exists
      END OF ty_found,
      tt_found TYPE STANDARD TABLE OF ty_found WITH EMPTY KEY,

      BEGIN OF ty_org,
        kind      TYPE c LENGTH 1,   "P plant / storage location, S sales area
        werks     TYPE werks_d,
        lgort     TYPE lgort_d,
        vkorg     TYPE vkorg,
        vtweg     TYPE vtweg,
        werks_txt TYPE c LENGTH 30,
        lgort_txt TYPE c LENGTH 16,
        vkorg_txt TYPE c LENGTH 20,
        vtweg_txt TYPE c LENGTH 20,
      END OF ty_org,
      tt_org TYPE STANDARD TABLE OF ty_org WITH EMPTY KEY.

    "! Posted materials (not marked for deletion) by number or description
    CLASS-METHODS search
      IMPORTING iv_text         TYPE clike OPTIONAL
                iv_mtart        TYPE clike OPTIONAL
                iv_max          TYPE i DEFAULT 50
      RETURNING VALUE(rt_found) TYPE tt_found.

    "! Plants with storage locations and sales areas the material exists in
    CLASS-METHODS get_scope
      IMPORTING iv_matnr       TYPE clike
      RETURNING VALUE(rt_org)  TYPE tt_org.

    "! Raises when the material is missing, blocked for deletion or already in an open change or extension request
    CLASS-METHODS check_allowed
      IMPORTING iv_matnr TYPE clike
      RAISING   zcx_mm_mdm.

    CLASS-METHODS start_change
      IMPORTING iv_matnr          TYPE clike
                iv_werks          TYPE clike OPTIONAL
                iv_lgort          TYPE clike OPTIONAL
                iv_vkorg          TYPE clike OPTIONAL
                iv_vtweg          TYPE clike OPTIONAL
                iv_user           TYPE syuname
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid
      RAISING   zcx_mm_mdm.

    "! iv_type: P new plant (or new storage location of a plant), S new sales area, V new valuation type
    CLASS-METHODS start_extension
      IMPORTING iv_matnr          TYPE clike
                iv_type           TYPE clike
                iv_werks          TYPE clike OPTIONAL
                iv_lgort          TYPE clike OPTIONAL
                iv_vkorg          TYPE clike OPTIONAL
                iv_vtweg          TYPE clike OPTIONAL
                iv_bwtar          TYPE clike OPTIONAL
                iv_src_werks      TYPE clike OPTIONAL
                iv_src_vkorg      TYPE clike OPTIONAL
                iv_src_vtweg      TYPE clike OPTIONAL
                iv_user           TYPE syuname
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid
      RAISING   zcx_mm_mdm.

    "! TRANSID under which the base snapshot of a request is kept
    CLASS-METHODS base_id
      IMPORTING iv_transid        TYPE zif_mm_mdm_types=>ty_transid
      RETURNING VALUE(rv_base_id) TYPE zif_mm_mdm_types=>ty_transid.

  PRIVATE SECTION.
    CLASS-METHODS new_request
      IMPORTING iv_app            TYPE clike
                iv_mtart          TYPE mtart
                iv_matnr          TYPE matnr
                iv_user           TYPE syuname
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid
      RAISING   zcx_mm_mdm.
    CLASS-METHODS matnr_in
      IMPORTING iv_matnr        TYPE clike
      RETURNING VALUE(rv_matnr) TYPE matnr.
    CLASS-METHODS copy_live
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_matnr   TYPE matnr
                iv_werks   TYPE werks_d
                iv_lgort   TYPE lgort_d
                iv_vkorg   TYPE vkorg
                iv_vtweg   TYPE vtweg
                iv_bwtar   TYPE bwtar_d OPTIONAL.
    CLASS-METHODS copy_more
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_matnr   TYPE matnr
                iv_werks   TYPE werks_d.
    CLASS-METHODS check_workflow
      IMPORTING iv_app   TYPE clike
                iv_mtart TYPE mtart
      RAISING   zcx_mm_mdm.
    CLASS-METHODS copy_texts
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_matnr   TYPE matnr
                iv_werks   TYPE werks_d
                iv_vkorg   TYPE vkorg
                iv_vtweg   TYPE vtweg.
ENDCLASS.



CLASS ZCL_MM_MDM_CHANGE IMPLEMENTATION.


  METHOD base_id.
    rv_base_id = iv_transid + 5000000000.
  ENDMETHOD.


  METHOD matnr_in.
    rv_matnr = |{ iv_matnr ALPHA = IN }|.
  ENDMETHOD.


  METHOD search.
    DATA lv_find TYPE c LENGTH 42.
    DATA lv_mt TYPE c LENGTH 4.
    DATA lv_txt TYPE c LENGTH 40.
    lv_txt = to_upper( CONV string( iv_text ) ).
    lv_find = |%{ lv_txt }%|.
    lv_mt = iv_mtart.
    DATA lv_num TYPE c LENGTH 42.
    lv_num = |%{ lv_txt }|.
    SELECT m~matnr, k~maktx, m~mtart, m~matkl, m~meins
      FROM mara AS m
      INNER JOIN makt AS k ON k~matnr = m~matnr AND k~spras = 'E'
      WHERE m~lvorm = @space
        AND ( @lv_mt = '' OR m~mtart = @lv_mt )
        AND ( @lv_txt = '' OR k~maktg LIKE @lv_find OR m~matnr LIKE @lv_num )
      ORDER BY m~matnr DESCENDING
      INTO TABLE @DATA(lt_rows) UP TO @iv_max ROWS.
    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      APPEND VALUE #( matnr = <r>-matnr maktx = <r>-maktx mtart = <r>-mtart matkl = <r>-matkl meins = <r>-meins ) TO rt_found.
    ENDLOOP.
    CHECK rt_found IS NOT INITIAL.
    SELECT obj_value FROM /inowits/m_trans
      WHERE app_id IN ( 'MX', 'ME' ) AND status IN ( '00', '01', '02', '04' )
      INTO TABLE @DATA(lt_busy).
    LOOP AT rt_found ASSIGNING FIELD-SYMBOL(<f>).
      <f>-busy = xsdbool( line_exists( lt_busy[ obj_value = <f>-matnr ] ) OR line_exists( lt_busy[ obj_value = |{ <f>-matnr ALPHA = OUT }| ] ) ).
    ENDLOOP.
  ENDMETHOD.


  METHOD get_scope.
    DATA(lv_matnr) = matnr_in( iv_matnr ).
    SELECT d~werks, d~lgort, w~name1 AS werks_txt, l~lgobe AS lgort_txt
      FROM mard AS d
      LEFT OUTER JOIN t001w AS w ON w~werks = d~werks
      LEFT OUTER JOIN t001l AS l ON l~werks = d~werks AND l~lgort = d~lgort
      WHERE d~matnr = @lv_matnr
      ORDER BY d~werks, d~lgort
      INTO TABLE @DATA(lt_p).
    LOOP AT lt_p ASSIGNING FIELD-SYMBOL(<p>).
      APPEND VALUE #( kind = 'P' werks = <p>-werks lgort = <p>-lgort werks_txt = <p>-werks_txt lgort_txt = <p>-lgort_txt ) TO rt_org.
    ENDLOOP.
    SELECT c~werks, w~name1 AS werks_txt FROM marc AS c LEFT OUTER JOIN t001w AS w ON w~werks = c~werks
      WHERE c~matnr = @lv_matnr ORDER BY c~werks INTO TABLE @DATA(lt_c).
    LOOP AT lt_c ASSIGNING FIELD-SYMBOL(<c>).
      IF NOT line_exists( rt_org[ kind = 'P' werks = <c>-werks ] ).
        APPEND VALUE #( kind = 'P' werks = <c>-werks werks_txt = <c>-werks_txt ) TO rt_org.
      ENDIF.
    ENDLOOP.
    SELECT v~vkorg, v~vtweg, o~vtext AS vkorg_txt, t~vtext AS vtweg_txt
      FROM mvke AS v
      LEFT OUTER JOIN tvkot AS o ON o~vkorg = v~vkorg AND o~spras = 'E'
      LEFT OUTER JOIN tvtwt AS t ON t~vtweg = v~vtweg AND t~spras = 'E'
      WHERE v~matnr = @lv_matnr
      ORDER BY v~vkorg, v~vtweg
      INTO TABLE @DATA(lt_s).
    LOOP AT lt_s ASSIGNING FIELD-SYMBOL(<s>).
      APPEND VALUE #( kind = 'S' vkorg = <s>-vkorg vtweg = <s>-vtweg vkorg_txt = <s>-vkorg_txt vtweg_txt = <s>-vtweg_txt ) TO rt_org.
    ENDLOOP.
  ENDMETHOD.


  METHOD check_allowed.
    DATA(lv_matnr) = matnr_in( iv_matnr ).
    SELECT SINGLE lvorm FROM mara WHERE matnr = @lv_matnr INTO @DATA(lv_del).
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |Material { lv_matnr ALPHA = OUT } does not exist| ).
    ENDIF.
    IF lv_del IS NOT INITIAL.
      zcx_mm_mdm=>raise_text( |Material { lv_matnr ALPHA = OUT } is marked for deletion| ).
    ENDIF.
    "an open request is one that is a draft, requested, in progress or sent back (the old check was always true)
    SELECT transid, app_id, user_id FROM /inowits/m_trans
      WHERE app_id IN ( 'MX', 'ME' ) AND status IN ( '00', '01', '02', '04' )
        AND ( obj_value = @lv_matnr OR obj_value = @( |{ lv_matnr ALPHA = OUT }| ) )
      INTO TABLE @DATA(lt_open) UP TO 1 ROWS.
    IF lt_open IS NOT INITIAL.
      zcx_mm_mdm=>raise_text( |Material { lv_matnr ALPHA = OUT } is already in process (request { lt_open[ 1 ]-transid ALPHA = OUT }, { lt_open[ 1 ]-user_id })| ).
    ENDIF.
  ENDMETHOD.


  METHOD new_request.
    "same number draw as the create flow: one session at a time, committed before the lock is released
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = '/INOWITS/M_TRANS' varkey = 'TRANSID_GEN' _wait = 'X'
      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( 'Could not reserve a request number, please try again' ).
    ENDIF.
    DATA lv_app  TYPE /inowits/m_trans-app_id.
    DATA lv_user TYPE uname.
    DATA lv_gen  TYPE /inowits/wf_gen_type.
    DATA lv_obj  TYPE /inowits/obj_value.
    DATA lv_tid  TYPE /inowits/m_trans-transid.
    lv_app = iv_app.  lv_user = iv_user.  lv_gen = iv_mtart.  lv_obj = iv_matnr.
    CALL FUNCTION '/INOWITS/M_TRANSID_GENERATE'
      EXPORTING iv_app_id = lv_app iv_draft = 1 iv_obj_value = lv_obj iv_user = lv_user iv_gen_type = lv_gen
      IMPORTING ev_trans_id = lv_tid.
    rv_transid = lv_tid.
    UPDATE /inowits/m_trans SET obj_value = @iv_matnr WHERE transid = @rv_transid AND app_id = @iv_app.
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = '/INOWITS/M_TRANS' varkey = 'TRANSID_GEN'.
  ENDMETHOD.


  METHOD copy_live.
    "Live data of the material and the chosen organisational level, written as staging rows of iv_transid
    SELECT SINGLE * FROM mara WHERE matnr = @iv_matnr INTO @DATA(ls_mara).
    SELECT SINGLE maktx FROM makt WHERE matnr = @iv_matnr AND spras = 'E' INTO @DATA(lv_maktx).
    DATA ls_s_mara TYPE /inowits/mm_mara.
    MOVE-CORRESPONDING ls_mara TO ls_s_mara.
    ls_s_mara-transid = iv_transid.  ls_s_mara-matnr = iv_matnr.  ls_s_mara-maktx = lv_maktx.
    INSERT /inowits/mm_mara FROM @ls_s_mara.

    INSERT /inowits/mm_makt FROM @( VALUE #( transid = iv_transid matnr = iv_matnr spras = 'E' maktx = lv_maktx ) ).

    IF iv_werks IS NOT INITIAL.
      SELECT SINGLE * FROM marc WHERE matnr = @iv_matnr AND werks = @iv_werks INTO @DATA(ls_marc).
      IF sy-subrc = 0.
        DATA ls_s_marc TYPE /inowits/mm_marc.
        MOVE-CORRESPONDING ls_marc TO ls_s_marc.
        ls_s_marc-transid = iv_transid.  ls_s_marc-matnr = iv_matnr.
        INSERT /inowits/mm_marc FROM @ls_s_marc.
      ENDIF.
      SELECT SINGLE * FROM mbew WHERE matnr = @iv_matnr AND bwkey = @iv_werks AND bwtar = @iv_bwtar INTO @DATA(ls_mbew).
      IF sy-subrc = 0.
        DATA ls_s_mbew TYPE /inowits/mm_mbew.
        MOVE-CORRESPONDING ls_mbew TO ls_s_mbew.
        ls_s_mbew-transid = iv_transid.  ls_s_mbew-matnr = iv_matnr.
        INSERT /inowits/mm_mbew FROM @ls_s_mbew.
      ENDIF.
      IF iv_lgort IS NOT INITIAL.
        SELECT SINGLE * FROM mard WHERE matnr = @iv_matnr AND werks = @iv_werks AND lgort = @iv_lgort INTO @DATA(ls_mard).
        IF sy-subrc = 0.
          DATA ls_s_mard TYPE /inowits/mm_mard.
          MOVE-CORRESPONDING ls_mard TO ls_s_mard.
          ls_s_mard-transid = iv_transid.  ls_s_mard-matnr = iv_matnr.
          INSERT /inowits/mm_mard FROM @ls_s_mard.
        ENDIF.
      ENDIF.
      "quality inspection setup of the plant
      SELECT * FROM qmat WHERE matnr = @iv_matnr AND werks = @iv_werks INTO TABLE @DATA(lt_qmat).
      LOOP AT lt_qmat ASSIGNING FIELD-SYMBOL(<q>).
        DATA ls_s_qmat TYPE /inowits/mm_qmat.
        CLEAR ls_s_qmat.
        MOVE-CORRESPONDING <q> TO ls_s_qmat.
        ls_s_qmat-transid = iv_transid.  ls_s_qmat-matnr = iv_matnr.
        INSERT /inowits/mm_qmat FROM @ls_s_qmat.
      ENDLOOP.
      "India: chapter ID, assessable value, MODVAT
      SELECT SINGLE * FROM j_1imtchid WHERE matnr = @iv_matnr AND werks = @iv_werks INTO @DATA(ls_chid).
      IF sy-subrc = 0.
        DATA ls_s_exse TYPE /inowits/mm_exse.
        MOVE-CORRESPONDING ls_chid TO ls_s_exse.
        SELECT SINGLE * FROM j_1iassval WHERE j_1imatnr = @iv_matnr AND j_1iwerks = @iv_werks INTO @DATA(ls_av).
        IF sy-subrc = 0. MOVE-CORRESPONDING ls_av TO ls_s_exse. ENDIF.
        SELECT SINGLE * FROM j_1imoddet WHERE j_1imoim = @iv_matnr AND werks = @iv_werks INTO @DATA(ls_md).
        IF sy-subrc = 0. MOVE-CORRESPONDING ls_md TO ls_s_exse. ENDIF.
        ls_s_exse-transid = iv_transid.  ls_s_exse-matnr = iv_matnr.
        INSERT /inowits/mm_exse FROM @ls_s_exse.
      ENDIF.
    ENDIF.

    IF iv_vkorg IS NOT INITIAL AND iv_vtweg IS NOT INITIAL.
      SELECT SINGLE * FROM mvke WHERE matnr = @iv_matnr AND vkorg = @iv_vkorg AND vtweg = @iv_vtweg INTO @DATA(ls_mvke).
      IF sy-subrc = 0.
        DATA ls_s_mvke TYPE /inowits/mm_mvke.
        MOVE-CORRESPONDING ls_mvke TO ls_s_mvke.
        ls_s_mvke-transid = iv_transid.  ls_s_mvke-matnr = iv_matnr.
        INSERT /inowits/mm_mvke FROM @ls_s_mvke.
      ENDIF.
    ENDIF.

    "warehouse data (first warehouse number and storage type of the material)
    SELECT SINGLE * FROM mlgn WHERE matnr = @iv_matnr INTO @DATA(ls_mlgn).
    IF sy-subrc = 0.
      DATA ls_s_mlgn TYPE /inowits/mm_mlgn.
      MOVE-CORRESPONDING ls_mlgn TO ls_s_mlgn.
      ls_s_mlgn-transid = iv_transid.  ls_s_mlgn-matnr = iv_matnr.
      INSERT /inowits/mm_mlgn FROM @ls_s_mlgn.
      SELECT SINGLE * FROM mlgt WHERE matnr = @iv_matnr AND lgnum = @ls_mlgn-lgnum INTO @DATA(ls_mlgt).
      IF sy-subrc = 0.
        DATA ls_s_mlgt TYPE /inowits/mm_mlgt.
        MOVE-CORRESPONDING ls_mlgt TO ls_s_mlgt.
        ls_s_mlgt-transid = iv_transid.  ls_s_mlgt-matnr = iv_matnr.
        INSERT /inowits/mm_mlgt FROM @ls_s_mlgt.
      ENDIF.
    ENDIF.

    "units of measure and EAN
    SELECT * FROM marm WHERE matnr = @iv_matnr INTO TABLE @DATA(lt_marm).
    LOOP AT lt_marm ASSIGNING FIELD-SYMBOL(<mm>).
      DATA ls_s_marm TYPE /inowits/mm_marm.
      CLEAR ls_s_marm.
      MOVE-CORRESPONDING <mm> TO ls_s_marm.
      ls_s_marm-transid = iv_transid.
      INSERT /inowits/mm_marm FROM @ls_s_marm.
    ENDLOOP.
    SELECT * FROM mean WHERE matnr = @iv_matnr INTO TABLE @DATA(lt_mean).
    LOOP AT lt_mean ASSIGNING FIELD-SYMBOL(<me>).
      DATA ls_s_mean TYPE /inowits/mm_mean.
      CLEAR ls_s_mean.
      MOVE-CORRESPONDING <me> TO ls_s_mean.
      ls_s_mean-transid = iv_transid.
      INSERT /inowits/mm_mean FROM @ls_s_mean.
    ENDLOOP.

    copy_texts( iv_transid = iv_transid iv_matnr = iv_matnr iv_werks = iv_werks iv_vkorg = iv_vkorg iv_vtweg = iv_vtweg ).
    copy_more( iv_transid = iv_transid iv_matnr = iv_matnr iv_werks = iv_werks ).
  ENDMETHOD.


  METHOD check_workflow.
    "no definition for the app and material type = nobody to route the request to (the old system simply had none for these types)
    SELECT SINGLE app_id FROM /inowits/wf_def WHERE app_id = @iv_app AND gen_type = @iv_mtart INTO @DATA(lv_x).
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |No { COND string( WHEN iv_app = 'MX' THEN `change` ELSE `extension` ) } workflow is defined for material type { iv_mtart }| ).
    ENDIF.
  ENDMETHOD.


  METHOD copy_more.
    "Tax classification (country and tax categories, through the standard read), classification values, replenishment,
    "production versions, preference prices, export control and forecast parameters
    DATA lt_tax TYPE STANDARD TABLE OF bapi_mlan_ga WITH EMPTY KEY.
    CALL FUNCTION 'BAPI_MATERIAL_GETALL'
      EXPORTING material = iv_matnr
      TABLES taxclassifications = lt_tax
      EXCEPTIONS OTHERS = 1.
    DATA(lv_sr) = 0.
    LOOP AT lt_tax ASSIGNING FIELD-SYMBOL(<t>).
      DATA ls_mlan TYPE /inowits/mm_mlan.
      CLEAR ls_mlan.
      ls_mlan-transid = iv_transid.  ls_mlan-matnr = iv_matnr.  ls_mlan-aland = <t>-depcountry.
      DO 9 TIMES.
        ASSIGN COMPONENT |TAX_TYPE_{ sy-index }| OF STRUCTURE <t> TO FIELD-SYMBOL(<tt>).
        ASSIGN COMPONENT |TAXCLASS_{ sy-index }| OF STRUCTURE <t> TO FIELD-SYMBOL(<tc>).
        CHECK <tt> IS ASSIGNED AND <tc> IS ASSIGNED AND <tt> IS NOT INITIAL.
        ASSIGN COMPONENT |TAXM{ sy-index }| OF STRUCTURE ls_mlan TO FIELD-SYMBOL(<m>).
        IF <m> IS ASSIGNED. <m> = <tc>. ENDIF.
        lv_sr = lv_sr + 1.
        INSERT /inowits/mm_stax FROM @( VALUE #( transid = iv_transid matnr = iv_matnr sr_no = lv_sr tatyp = <tt> aland = <t>-depcountry taxkd = <tc> ) ).
        UNASSIGN: <tt>, <tc>, <m>.
      ENDDO.
      INSERT /inowits/mm_mlan FROM @ls_mlan.
    ENDLOOP.

    "classification: classes of the material and their characteristic values
    DATA lt_cl TYPE STANDARD TABLE OF bapi1003_alloc_list WITH EMPTY KEY.
    DATA lt_r1 TYPE bapiret2_t.
    DATA(lv_obj) = CONV bapi1003_key-object( iv_matnr ).
    CALL FUNCTION 'BAPI_OBJCL_GETCLASSES'
      EXPORTING objectkey_imp = lv_obj objecttable_imp = 'MARA' classtype_imp = '001' read_valuations = 'X'
      TABLES alloclist = lt_cl return = lt_r1
      EXCEPTIONS OTHERS = 1.
    DATA(lv_cs) = 0.
    LOOP AT lt_cl ASSIGNING FIELD-SYMBOL(<c>).
      DATA lt_ac TYPE STANDARD TABLE OF bapi1003_alloc_values_char WITH EMPTY KEY.
      DATA lt_an TYPE STANDARD TABLE OF bapi1003_alloc_values_num WITH EMPTY KEY.
      DATA lt_ar TYPE STANDARD TABLE OF bapi1003_alloc_values_curr WITH EMPTY KEY.
      DATA lt_r2 TYPE bapiret2_t.
      CLEAR: lt_ac, lt_an, lt_ar, lt_r2.
      CALL FUNCTION 'BAPI_OBJCL_GETDETAIL'
        EXPORTING objectkey = lv_obj objecttable = 'MARA' classnum = <c>-classnum classtype = <c>-classtype
        TABLES allocvaluesnum = lt_an allocvalueschar = lt_ac allocvaluescurr = lt_ar return = lt_r2
        EXCEPTIONS OTHERS = 1.
      LOOP AT lt_ac ASSIGNING FIELD-SYMBOL(<v>).
        lv_cs = lv_cs + 1.
        INSERT /inowits/mm_rmcl FROM @( VALUE #( transid = iv_transid matnr = iv_matnr sr_no = lv_cs class = <c>-classnum klart = <c>-classtype
                                                 statu = '1' atnam = <v>-charact atbez = <v>-charact_descr atwrt = <v>-value_char ) ).
      ENDLOOP.
    ENDLOOP.

    IF iv_werks IS NOT INITIAL.
      SELECT SINGLE * FROM wrpl WHERE matnr = @iv_matnr INTO @DATA(ls_wrpl).
      IF sy-subrc = 0.
        DATA ls_s_wrpl TYPE /inowits/mm_wrpl.
        MOVE-CORRESPONDING ls_wrpl TO ls_s_wrpl.
        ls_s_wrpl-transid = iv_transid.
        INSERT /inowits/mm_wrpl FROM @ls_s_wrpl.
      ENDIF.
      SELECT * FROM mkal WHERE matnr = @iv_matnr AND werks = @iv_werks INTO TABLE @DATA(lt_mkal).
      LOOP AT lt_mkal ASSIGNING FIELD-SYMBOL(<k>).
        DATA ls_s_ws TYPE /inowits/mm_ws_v.
        CLEAR ls_s_ws.
        MOVE-CORRESPONDING <k> TO ls_s_ws.
        ls_s_ws-transid = iv_transid.
        INSERT /inowits/mm_ws_v FROM @ls_s_ws.
        IF sy-tabix = 1.
          DATA ls_s_mk TYPE /inowits/mm_mkal.
          MOVE-CORRESPONDING <k> TO ls_s_mk.
          ls_s_mk-transid = iv_transid.
          INSERT /inowits/mm_mkal FROM @ls_s_mk.
        ENDIF.
      ENDLOOP.
      SELECT * FROM mape WHERE matnr = @iv_matnr AND werks = @iv_werks INTO TABLE @DATA(lt_mape).
      LOOP AT lt_mape ASSIGNING FIELD-SYMBOL(<p>).
        DATA ls_s_mape TYPE /inowits/mm_mape.
        CLEAR ls_s_mape.
        MOVE-CORRESPONDING <p> TO ls_s_mape.
        ls_s_mape-transid = iv_transid.  ls_s_mape-matnr = iv_matnr.
        INSERT /inowits/mm_mape FROM @ls_s_mape.
      ENDLOOP.
      SELECT SINGLE pnum1 FROM mapr WHERE matnr = @iv_matnr AND werks = @iv_werks INTO @DATA(lv_pnum).
      IF sy-subrc = 0.
        SELECT SINGLE * FROM prop WHERE pnum1 = @lv_pnum INTO @DATA(ls_mpop).
        IF sy-subrc = 0.
          DATA ls_s_prop TYPE /inowits/mm_prop.
          MOVE-CORRESPONDING ls_mpop TO ls_s_prop.
          ls_s_prop-transid = iv_transid.  ls_s_prop-matnr = iv_matnr.
          INSERT /inowits/mm_prop FROM @ls_s_prop.
        ENDIF.
      ENDIF.
    ENDIF.
    SELECT * FROM maex WHERE matnr = @iv_matnr INTO TABLE @DATA(lt_maex).
    LOOP AT lt_maex ASSIGNING FIELD-SYMBOL(<x>).
      DATA ls_s_maex TYPE /inowits/mm_maex.
      CLEAR ls_s_maex.
      MOVE-CORRESPONDING <x> TO ls_s_maex.
      ls_s_maex-transid = iv_transid.  ls_s_maex-matnr = iv_matnr.
      INSERT /inowits/mm_maex FROM @ls_s_maex.
    ENDLOOP.
  ENDMETHOD.


  METHOD copy_texts.
    "Long texts (basic data, internal comment, inspection, purchase order text; sales text and plant text of the level)
    TYPES: BEGIN OF ty_t, fid TYPE tdid, obj TYPE tdobject, name TYPE tdobname, END OF ty_t.
    DATA lt_t TYPE STANDARD TABLE OF ty_t WITH EMPTY KEY.
    lt_t = VALUE #(
      ( fid = 'GRUN' obj = 'MATERIAL' name = |{ iv_matnr }| )
      ( fid = 'PRUE' obj = 'MATERIAL' name = |{ iv_matnr }| )
      ( fid = 'IVER' obj = 'MATERIAL' name = |{ iv_matnr }| )
      ( fid = 'BEST' obj = 'MATERIAL' name = |{ iv_matnr }| ) ).
    IF iv_vkorg IS NOT INITIAL.
      APPEND VALUE #( fid = '0001' obj = 'MVKE' name = |{ iv_matnr }{ iv_vkorg }{ iv_vtweg }| ) TO lt_t.
    ENDIF.
    IF iv_werks IS NOT INITIAL.
      APPEND VALUE #( fid = 'LTXT' obj = 'MDTXT' name = |{ iv_matnr }{ iv_werks }| ) TO lt_t.
    ENDIF.
    LOOP AT lt_t ASSIGNING FIELD-SYMBOL(<t>).
      DATA lt_lines TYPE STANDARD TABLE OF tline WITH EMPTY KEY.
      CLEAR lt_lines.
      CALL FUNCTION 'READ_TEXT'
        EXPORTING id = <t>-fid language = 'E' name = <t>-name object = <t>-obj
        TABLES lines = lt_lines
        EXCEPTIONS OTHERS = 1.
      CHECK sy-subrc = 0 AND lt_lines IS NOT INITIAL.
      DATA(lv_text) = REDUCE string( INIT s = `` FOR l IN lt_lines NEXT s = COND #( WHEN s IS INITIAL THEN l-tdline ELSE |{ s }{ cl_abap_char_utilities=>newline }{ l-tdline }| ) ).
      INSERT /inowits/mm_text FROM @( VALUE #( transid = iv_transid matnr = iv_matnr fid = <t>-fid text = lv_text ) ).
    ENDLOOP.
  ENDMETHOD.


  METHOD start_change.
    DATA(lv_matnr) = matnr_in( iv_matnr ).
    check_allowed( lv_matnr ).
    DATA(lv_werks) = CONV werks_d( iv_werks ).
    DATA(lv_lgort) = CONV lgort_d( iv_lgort ).
    DATA(lv_vkorg) = CONV vkorg( iv_vkorg ).
    DATA(lv_vtweg) = CONV vtweg( iv_vtweg ).
    "the pairs the Web Dynpro popup validated
    IF lv_werks IS NOT INITIAL AND lv_lgort IS NOT INITIAL.
      SELECT SINGLE lgort FROM mard WHERE matnr = @lv_matnr AND werks = @lv_werks AND lgort = @lv_lgort INTO @DATA(lv_x1).
      IF sy-subrc <> 0.
        zcx_mm_mdm=>raise_text( |Plant { lv_werks } and storage location { lv_lgort } are not maintained for this material| ).
      ENDIF.
    ELSEIF lv_werks IS NOT INITIAL.
      SELECT SINGLE werks FROM marc WHERE matnr = @lv_matnr AND werks = @lv_werks INTO @DATA(lv_x2).
      IF sy-subrc <> 0.
        zcx_mm_mdm=>raise_text( |Plant { lv_werks } is not maintained for this material| ).
      ENDIF.
    ENDIF.
    IF lv_vkorg IS NOT INITIAL OR lv_vtweg IS NOT INITIAL.
      SELECT SINGLE vkorg FROM mvke WHERE matnr = @lv_matnr AND vkorg = @lv_vkorg AND vtweg = @lv_vtweg INTO @DATA(lv_x3).
      IF sy-subrc <> 0.
        zcx_mm_mdm=>raise_text( |Sales organisation { lv_vkorg } and distribution channel { lv_vtweg } are not maintained for this material| ).
      ENDIF.
    ENDIF.
    IF lv_werks IS NOT INITIAL AND lv_vkorg IS NOT INITIAL.
      SELECT SINGLE vkorg FROM tvkwz WHERE vkorg = @lv_vkorg AND vtweg = @lv_vtweg AND werks = @lv_werks INTO @DATA(lv_x4).
      IF sy-subrc <> 0.
        zcx_mm_mdm=>raise_text( |Plant { lv_werks } is not assigned to sales organisation { lv_vkorg } / { lv_vtweg }| ).
      ENDIF.
    ENDIF.

    SELECT SINGLE mtart FROM mara WHERE matnr = @lv_matnr INTO @DATA(lv_mtart).
    check_workflow( iv_app = c_app_change iv_mtart = lv_mtart ).
    rv_transid = new_request( iv_app = c_app_change iv_mtart = lv_mtart iv_matnr = lv_matnr iv_user = iv_user ).
    copy_live( iv_transid = rv_transid iv_matnr = lv_matnr iv_werks = lv_werks iv_lgort = lv_lgort iv_vkorg = lv_vkorg iv_vtweg = lv_vtweg ).
    copy_live( iv_transid = base_id( rv_transid ) iv_matnr = lv_matnr iv_werks = lv_werks iv_lgort = lv_lgort iv_vkorg = lv_vkorg iv_vtweg = lv_vtweg ).
    INSERT /inowits/m_vwsel FROM @( VALUE #( transid = rv_transid ) ).
    "No commit: the caller (action) ends the unit of work.
  ENDMETHOD.


  METHOD start_extension.
    DATA(lv_matnr) = matnr_in( iv_matnr ).
    check_allowed( lv_matnr ).
    DATA(lv_type) = to_upper( CONV string( iv_type ) ).
    DATA(lv_werks) = CONV werks_d( iv_werks ).
    DATA(lv_lgort) = CONV lgort_d( iv_lgort ).
    DATA(lv_vkorg) = CONV vkorg( iv_vkorg ).
    DATA(lv_vtweg) = CONV vtweg( iv_vtweg ).
    DATA(lv_bwtar) = CONV bwtar_d( iv_bwtar ).
    DATA(lv_src_werks) = COND werks_d( WHEN iv_src_werks IS NOT INITIAL THEN iv_src_werks ELSE lv_werks ).
    DATA(lv_src_vkorg) = COND vkorg( WHEN iv_src_vkorg IS NOT INITIAL THEN iv_src_vkorg ELSE lv_vkorg ).
    DATA(lv_src_vtweg) = COND vtweg( WHEN iv_src_vtweg IS NOT INITIAL THEN iv_src_vtweg ELSE lv_vtweg ).

    CASE lv_type.
      WHEN 'S'.
        IF lv_werks IS INITIAL OR lv_vkorg IS INITIAL OR lv_vtweg IS INITIAL.
          zcx_mm_mdm=>raise_text( 'Please fill plant, sales organisation and distribution channel' ).
        ENDIF.
        SELECT SINGLE vkorg FROM mvke WHERE matnr = @lv_matnr AND vkorg = @lv_vkorg AND vtweg = @lv_vtweg INTO @DATA(lv_e1).
        IF sy-subrc = 0.
          zcx_mm_mdm=>raise_text( 'This selection is already maintained' ).
        ENDIF.
        SELECT SINGLE vkorg FROM tvta WHERE vkorg = @lv_vkorg AND vtweg = @lv_vtweg INTO @DATA(lv_t1).
        IF sy-subrc <> 0.
          zcx_mm_mdm=>raise_text( |Sales organisation { lv_vkorg } / distribution channel { lv_vtweg } is not valid| ).
        ENDIF.
        SELECT SINGLE vkorg FROM tvkwz WHERE vkorg = @lv_vkorg AND vtweg = @lv_vtweg AND werks = @lv_werks INTO @DATA(lv_t2).
        IF sy-subrc <> 0.
          zcx_mm_mdm=>raise_text( |Plant { lv_werks } is not assigned to sales organisation { lv_vkorg } / { lv_vtweg }| ).
        ENDIF.
      WHEN 'P'.
        IF lv_werks IS INITIAL.
          zcx_mm_mdm=>raise_text( 'Please fill the plant' ).
        ENDIF.
        SELECT SINGLE werks FROM t001w WHERE werks = @lv_werks INTO @DATA(lv_t3).
        IF sy-subrc <> 0.
          zcx_mm_mdm=>raise_text( |Plant { lv_werks } does not exist| ).
        ENDIF.
        IF lv_lgort IS NOT INITIAL.
          SELECT SINGLE lgort FROM t001l WHERE werks = @lv_werks AND lgort = @lv_lgort INTO @DATA(lv_t4).
          IF sy-subrc <> 0.
            zcx_mm_mdm=>raise_text( |Storage location { lv_lgort } does not exist in plant { lv_werks }| ).
          ENDIF.
          SELECT SINGLE lgort FROM mard WHERE matnr = @lv_matnr AND werks = @lv_werks AND lgort = @lv_lgort INTO @DATA(lv_e2).
          IF sy-subrc = 0.
            zcx_mm_mdm=>raise_text( 'This selection is already maintained' ).
          ENDIF.
        ELSE.
          SELECT SINGLE werks FROM marc WHERE matnr = @lv_matnr AND werks = @lv_werks INTO @DATA(lv_e3).
          IF sy-subrc = 0.
            zcx_mm_mdm=>raise_text( |Material is already extended to plant { lv_werks }| ).
          ENDIF.
        ENDIF.
        IF lv_src_werks = lv_werks OR lv_src_werks IS INITIAL.
          SELECT SINGLE werks FROM marc WHERE matnr = @lv_matnr INTO @lv_src_werks.
        ENDIF.
      WHEN 'V'.
        IF lv_werks IS INITIAL OR lv_bwtar IS INITIAL.
          zcx_mm_mdm=>raise_text( 'Please fill the plant and the valuation type' ).
        ENDIF.
        SELECT SINGLE bwtty FROM mbew WHERE matnr = @lv_matnr AND bwkey = @lv_werks AND bwtar = @space INTO @DATA(lv_cat).
        IF sy-subrc <> 0 OR lv_cat IS INITIAL.
          zcx_mm_mdm=>raise_text( 'Valuation category does not allow split valuation' ).
        ENDIF.
        SELECT SINGLE bwtar FROM t149a WHERE bwkey = @lv_werks AND bwtar = @lv_bwtar INTO @DATA(lv_t5).
        IF sy-subrc <> 0.
          zcx_mm_mdm=>raise_text( |Valuation type { lv_bwtar } does not exist for plant { lv_werks }| ).
        ENDIF.
        SELECT SINGLE bwtar FROM mbew WHERE matnr = @lv_matnr AND bwkey = @lv_werks AND bwtar = @lv_bwtar INTO @DATA(lv_e4).
        IF sy-subrc = 0.
          zcx_mm_mdm=>raise_text( 'Entered valuation type already extended' ).
        ENDIF.
      WHEN OTHERS.
        zcx_mm_mdm=>raise_text( 'The extension type must be P (plant or storage location), S (sales area) or V (valuation type)' ).
    ENDCASE.

    "an extension of the same level that is already in progress
    SELECT t~transid, t~user_id FROM /inowits/m_trans AS t
      WHERE t~app_id = 'ME' AND t~status IN ( '01', '02' ) AND t~obj_value = @lv_matnr
      INTO TABLE @DATA(lt_busy).
    LOOP AT lt_busy ASSIGNING FIELD-SYMBOL(<b>).
      IF lv_type = 'S'.
        SELECT SINGLE transid FROM /inowits/mm_mvke WHERE transid = @<b>-transid AND vkorg = @lv_vkorg AND vtweg = @lv_vtweg INTO @DATA(lv_b1).
      ELSEIF lv_type = 'P' AND lv_lgort IS NOT INITIAL.
        SELECT SINGLE transid FROM /inowits/mm_mard WHERE transid = @<b>-transid AND werks = @lv_werks AND lgort = @lv_lgort INTO @lv_b1.
      ELSE.
        SELECT SINGLE transid FROM /inowits/mm_marc WHERE transid = @<b>-transid AND werks = @lv_werks INTO @lv_b1.
      ENDIF.
      IF sy-subrc = 0.
        zcx_mm_mdm=>raise_text( |This selection is already in progress, request { <b>-transid ALPHA = OUT } of { <b>-user_id }| ).
      ENDIF.
    ENDLOOP.

    SELECT SINGLE mtart FROM mara WHERE matnr = @lv_matnr INTO @DATA(lv_mtart).
    check_workflow( iv_app = c_app_extend iv_mtart = lv_mtart ).
    rv_transid = new_request( iv_app = c_app_extend iv_mtart = lv_mtart iv_matnr = lv_matnr iv_user = iv_user ).

    "staging: the new level starts as a copy of the source level, under the new keys
    copy_live( iv_transid = rv_transid iv_matnr = lv_matnr iv_werks = COND #( WHEN lv_type = 'S' THEN lv_werks ELSE lv_src_werks )
               iv_lgort = space iv_vkorg = COND #( WHEN lv_type = 'S' THEN lv_src_vkorg ELSE space ) iv_vtweg = COND #( WHEN lv_type = 'S' THEN lv_src_vtweg ELSE space ) ).
    CASE lv_type.
      WHEN 'S'.
        "re-key the copied sales row to the new sales area (no sales row at the source: use any sales area as template)
        SELECT SINGLE * FROM /inowits/mm_mvke WHERE transid = @rv_transid INTO @DATA(ls_mv).
        IF sy-subrc <> 0.
          SELECT SINGLE * FROM mvke WHERE matnr = @lv_matnr INTO @DATA(ls_any).
          MOVE-CORRESPONDING ls_any TO ls_mv.
          ls_mv-transid = rv_transid.  ls_mv-matnr = lv_matnr.
        ENDIF.
        DELETE FROM /inowits/mm_mvke WHERE transid = @rv_transid.
        ls_mv-vkorg = lv_vkorg.  ls_mv-vtweg = lv_vtweg.
        INSERT /inowits/mm_mvke FROM @ls_mv.
      WHEN 'P'.
        IF lv_lgort IS INITIAL.
          SELECT SINGLE * FROM /inowits/mm_marc WHERE transid = @rv_transid INTO @DATA(ls_mc).
          DELETE FROM /inowits/mm_marc WHERE transid = @rv_transid.
          ls_mc-werks = lv_werks.
          INSERT /inowits/mm_marc FROM @ls_mc.
          SELECT SINGLE * FROM /inowits/mm_mbew WHERE transid = @rv_transid INTO @DATA(ls_mb).
          IF sy-subrc = 0.
            DELETE FROM /inowits/mm_mbew WHERE transid = @rv_transid.
            ls_mb-bwkey = lv_werks.
            INSERT /inowits/mm_mbew FROM @ls_mb.
          ENDIF.
        ELSE.
          SELECT SINGLE * FROM mard WHERE matnr = @lv_matnr INTO @DATA(ls_mard_any).
          DATA ls_s_mard TYPE /inowits/mm_mard.
          MOVE-CORRESPONDING ls_mard_any TO ls_s_mard.
          ls_s_mard-transid = rv_transid.  ls_s_mard-matnr = lv_matnr.  ls_s_mard-werks = lv_werks.  ls_s_mard-lgort = lv_lgort.
          CLEAR: ls_s_mard-labst, ls_s_mard-insme, ls_s_mard-speme.
          INSERT /inowits/mm_mard FROM @ls_s_mard.
        ENDIF.
      WHEN 'V'.
        SELECT SINGLE * FROM /inowits/mm_mbew WHERE transid = @rv_transid INTO @DATA(ls_mv2).
        IF sy-subrc = 0.
          DELETE FROM /inowits/mm_mbew WHERE transid = @rv_transid.
          ls_mv2-bwtar = lv_bwtar.
          INSERT /inowits/mm_mbew FROM @ls_mv2.
        ENDIF.
    ENDCASE.
    INSERT /inowits/m_vwsel FROM @( VALUE #( transid = rv_transid ) ).
  ENDMETHOD.
ENDCLASS.
