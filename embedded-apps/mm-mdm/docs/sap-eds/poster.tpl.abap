"! Poster: posts the approved request into SAP (port of STND_UPDATE of the Web Dynpro component controller).
"! All six steps are ported except attachments/comments (DMS), IMD data (business 03) and the mails; posting is switched on
"! (c_implemented). See docs/CRS_AND_PH_SAP_STATUS.md.
"!
"! The field mapping below was extracted mechanically from STND_UPDATE (staging field to BAPI field); X flags are set
"! for every field that holds a value, as the old code did field by field.
CLASS zcl_mm_mdm_poster DEFINITION PUBLIC FINAL CREATE PUBLIC GLOBAL FRIENDS zcl_mm_mdm_poster_run.

  PUBLIC SECTION.
    METHODS post
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
      RAISING   zcx_mm_mdm.

  PRIVATE SECTION.
    "! Switched on only when every step below is implemented (tests may set mv_enabled).
    CONSTANTS c_implemented TYPE abap_bool VALUE abap_true.
    TYPES: BEGIN OF ty_rows,
             mara TYPE /inowits/mm_mara,
             marc TYPE /inowits/mm_marc,
             mard TYPE /inowits/mm_mard,
             mbew TYPE /inowits/mm_mbew,
             mlgn TYPE /inowits/mm_mlgn,
             mlgt TYPE /inowits/mm_mlgt,
             mvke TYPE /inowits/mm_mvke,
             prop TYPE /inowits/mm_prop,
             makt TYPE /inowits/mm_makt,
           END OF ty_rows.
    DATA mv_enabled TYPE abap_bool VALUE c_implemented.
    DATA mv_transid TYPE zif_mm_mdm_types=>ty_transid.
    DATA mv_matnr   TYPE matnr.
    DATA mv_mode    TYPE c LENGTH 1 VALUE 'C'.     "C create, X change, E extension
    DATA mv_meta_status TYPE c LENGTH 4 VALUE 'CA'.
    DATA mv_val_type TYPE bwtar_d.      "split valuation: valuation type of the second call
    DATA mv_bwtar_key TYPE bwtar_d.     "key used to find the plant defaults in ZMM_MDM
    DATA ms         TYPE ty_rows.
    DATA ms_sel     TYPE /inowits/m_vwsel.
    DATA mt_marm    TYPE STANDARD TABLE OF /inowits/mm_marm WITH EMPTY KEY.
    DATA mt_mean    TYPE STANDARD TABLE OF /inowits/mm_mean WITH EMPTY KEY.
    DATA mt_mlan    TYPE STANDARD TABLE OF /inowits/mm_mlan WITH EMPTY KEY.
    DATA mt_stax    TYPE STANDARD TABLE OF /inowits/mm_stax WITH EMPTY KEY.

    DATA ms_head    TYPE bapimathead.
    DATA ms_mara_b  TYPE bapi_mara.
    DATA ms_mara_x  TYPE bapi_marax.
    DATA ms_marc_b  TYPE bapi_marc.
    DATA ms_marc_x  TYPE bapi_marcx.
    DATA ms_mard_b  TYPE bapi_mard.
    DATA ms_mard_x  TYPE bapi_mardx.
    DATA ms_mbew_b  TYPE bapi_mbew.
    DATA ms_mbew_x  TYPE bapi_mbewx.
    DATA ms_mlgn_b  TYPE bapi_mlgn.
    DATA ms_mlgn_x  TYPE bapi_mlgnx.
    DATA ms_mlgt_b  TYPE bapi_mlgt.
    DATA ms_mlgt_x  TYPE bapi_mlgtx.
    DATA ms_mvke_b  TYPE bapi_mvke.
    DATA ms_mvke_x  TYPE bapi_mvkex.
    DATA ms_mpop_b  TYPE bapi_mpop.
    DATA ms_mpop_x  TYPE bapi_mpopx.
    DATA mt_desc    TYPE STANDARD TABLE OF bapi_makt WITH EMPTY KEY.
    DATA mt_marm_b  TYPE STANDARD TABLE OF bapi_marm WITH EMPTY KEY.
    DATA mt_marm_x  TYPE STANDARD TABLE OF bapi_marmx WITH EMPTY KEY.
    DATA mt_mean_b  TYPE STANDARD TABLE OF bapi_mean WITH EMPTY KEY.
    DATA mt_mlan_b  TYPE STANDARD TABLE OF bapi_mlan WITH EMPTY KEY.

    METHODS read_staging
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid OPTIONAL
      RAISING   zcx_mm_mdm.
    METHODS prepare RAISING zcx_mm_mdm.
    METHODS change_diff RAISING zcx_mm_mdm.
    METHODS diff_struct
      IMPORTING is_old TYPE any
      CHANGING  cs_new TYPE any cs_x TYPE any.
    METHODS ext_build RAISING zcx_mm_mdm.
    METHODS ext_kind RETURNING VALUE(rv_kind) TYPE char1.
    METHODS post_change RAISING zcx_mm_mdm.
    METHODS post_extension RAISING zcx_mm_mdm.
    METHODS build_bapi.
    METHODS call_bapi
      IMPORTING iv_test TYPE abap_bool
      RAISING   zcx_mm_mdm.
    METHODS set_flags
      IMPORTING is_data TYPE any
      CHANGING  cs_x    TYPE any.
    METHODS test_run                         RAISING zcx_mm_mdm.
    METHODS step1_number_and_attachments     RAISING zcx_mm_mdm.
    METHODS step2_save_material              RAISING zcx_mm_mdm.
    METHODS step3_repl_and_vers              RAISING zcx_mm_mdm.
    METHODS step4_tax_class_texts            RAISING zcx_mm_mdm.
    METHODS step5_inspection_and_trade       RAISING zcx_mm_mdm.
    METHODS step6_variants_and_keys          RAISING zcx_mm_mdm.
    METHODS already_posted RETURNING VALUE(rv_yes) TYPE abap_bool.
    METHODS india_tax RAISING zcx_mm_mdm.
    METHODS custom_fields RAISING zcx_mm_mdm.
    METHODS replica RAISING zcx_mm_mdm.
    METHODS prod_versions RAISING zcx_mm_mdm.
    METHODS long_texts RAISING zcx_mm_mdm.
    METHODS inspection RAISING zcx_mm_mdm.
    METHODS preference_prices RAISING zcx_mm_mdm.
    METHODS legal_control RAISING zcx_mm_mdm.
    METHODS classification RAISING zcx_mm_mdm.
    METHODS forecast_values RAISING zcx_mm_mdm.
    METHODS variants RAISING zcx_mm_mdm.
    METHODS phonetic_keys.
    METHODS meta_row.
    METHODS first_day
      IMPORTING iv_perkz TYPE clike iv_per TYPE clike
      RETURNING VALUE(rv_date) TYPE d.
    METHODS fail_on_return
      IMPORTING it_return TYPE bapiret2_t iv_what TYPE string
      RAISING   zcx_mm_mdm.
ENDCLASS.



CLASS ZCL_MM_MDM_POSTER IMPLEMENTATION.


  METHOD already_posted.
    "The header holds the material number (OBJ_VALUE) once step 1 has drawn it; the material then exists in MARA after step 2.
    SELECT SINGLE obj_value FROM /inowits/m_trans WHERE transid = @mv_transid INTO @DATA(lv_obj).
    IF sy-subrc = 0 AND lv_obj IS NOT INITIAL.
      mv_matnr = lv_obj.
      SELECT SINGLE matnr FROM mara WHERE matnr = @mv_matnr INTO @DATA(lv_exists).
      rv_yes = xsdbool( sy-subrc = 0 ).
    ENDIF.
  ENDMETHOD.


  METHOD post.
    mv_transid = iv_transid.
    IF mv_enabled = abap_false.
      zcx_mm_mdm=>raise_text( 'Posting to the material master is not switched on yet. The request stays with the approver, nothing was posted.' ).
    ENDIF.
    CASE iv_app_id.
      WHEN 'MX'.
        mv_mode = 'X'.
        post_change( ).
        RETURN.
      WHEN 'ME'.
        mv_mode = 'E'.
        post_extension( ).
        RETURN.
    ENDCASE.
    read_staging( ).
    IF already_posted( ) = abap_false.
      step1_number_and_attachments( ).
      test_run( ).
      step2_save_material( ).
    ENDIF.
    step3_repl_and_vers( ).
    step4_tax_class_texts( ).
    step5_inspection_and_trade( ).
    step6_variants_and_keys( ).
  ENDMETHOD.


  METHOD read_staging.
    DATA(lv_t) = COND zif_mm_mdm_types=>ty_transid( WHEN iv_transid IS NOT INITIAL THEN iv_transid ELSE mv_transid ).
    CLEAR: ms, ms_sel, mt_marm, mt_mean, mt_mlan, mt_stax.
    SELECT SINGLE * FROM /inowits/mm_mara WHERE transid = @lv_t INTO @ms-mara.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |No material data found for request { mv_transid ALPHA = OUT }| ).
    ENDIF.
    SELECT SINGLE * FROM /inowits/mm_marc WHERE transid = @lv_t INTO @ms-marc.
    SELECT SINGLE * FROM /inowits/mm_mard WHERE transid = @lv_t INTO @ms-mard.
    SELECT SINGLE * FROM /inowits/mm_mbew WHERE transid = @lv_t INTO @ms-mbew.
    SELECT SINGLE * FROM /inowits/mm_mlgn WHERE transid = @lv_t INTO @ms-mlgn.
    SELECT SINGLE * FROM /inowits/mm_mlgt WHERE transid = @lv_t INTO @ms-mlgt.
    SELECT SINGLE * FROM /inowits/mm_mvke WHERE transid = @lv_t INTO @ms-mvke.
    SELECT SINGLE * FROM /inowits/mm_prop WHERE transid = @lv_t INTO @ms-prop.
    SELECT SINGLE * FROM /inowits/mm_makt WHERE transid = @lv_t INTO @ms-makt.
    SELECT SINGLE * FROM /inowits/m_vwsel WHERE transid = @lv_t INTO @ms_sel.
    SELECT * FROM /inowits/mm_marm WHERE transid = @lv_t INTO TABLE @mt_marm.
    SELECT * FROM /inowits/mm_mean WHERE transid = @lv_t INTO TABLE @mt_mean.
    SELECT * FROM /inowits/mm_mlan WHERE transid = @lv_t INTO TABLE @mt_mlan.
    SELECT * FROM /inowits/mm_stax WHERE transid = @lv_t INTO TABLE @mt_stax.
  ENDMETHOD.


  METHOD set_flags.
    "X flag for every field that holds a value; key fields of the X structure (longer than one character) carry the value
    DATA(lo_d) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( is_data ) ).
    LOOP AT lo_d->components ASSIGNING FIELD-SYMBOL(<c>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE is_data TO FIELD-SYMBOL(<v>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE cs_x TO FIELD-SYMBOL(<f>).
      CHECK sy-subrc = 0.
      CHECK <v> IS NOT INITIAL.
      DESCRIBE FIELD <f> LENGTH DATA(lv_len) IN CHARACTER MODE.
      IF lv_len > 1.
        <f> = <v>.
      ELSE.
        <f> = 'X'.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD build_bapi.
    DATA(ls_mara) = ms-mara.
    DATA(ls_marc) = ms-marc.
    DATA(ls_mard) = ms-mard.
    DATA(ls_mbew) = ms-mbew.
    DATA(ls_mlgn) = ms-mlgn.
    DATA(ls_mlgt) = ms-mlgt.
    DATA(ls_mvke) = ms-mvke.
    DATA(ls_prop) = ms-prop.

    CLEAR: ms_head, ms_mara_b, ms_mara_x, ms_marc_b, ms_marc_x, ms_mard_b, ms_mard_x, ms_mbew_b, ms_mbew_x,
           ms_mlgn_b, ms_mlgn_x, ms_mlgt_b, ms_mlgt_x, ms_mvke_b, ms_mvke_x, ms_mpop_b, ms_mpop_x,
           mt_desc, mt_marm_b, mt_marm_x, mt_mean_b, mt_mlan_b.

    " ---- header: which views are created (selected views of the request)
    ms_head-material   = mv_matnr.
    ms_head-ind_sector = ls_mara-mbrsh.
    ms_head-matl_type  = ls_mara-mtart.
    ms_head-basic_view = xsdbool( ms_sel-mara_basic1 = 'X' OR ms_sel-mara_basic2 = 'X' ).
    ms_head-sales_view = xsdbool( ms_sel-mvke_sorg1 = 'X' OR ms_sel-mvke_sorg1_tax = 'X' OR ms_sel-mvke_sorg2 = 'X' OR ms_sel-mvke_sorg_tax = 'X' ).
    ms_head-mrp_view   = xsdbool( ms_sel-marc_mrp1 = 'X' OR ms_sel-marc_mrp2 = 'X' OR ms_sel-marc_mrp3 = 'X' OR ms_sel-marc_mrp4 = 'X' ).
    ms_head-work_sched_view = ms_head-mrp_view.
    ms_head-storage_view   = xsdbool( ms_sel-mara_plnt1 = 'X' OR ms_sel-mara_plnt2 = 'X' OR ms_sel-marc_gen = 'X' ).
    ms_head-account_view   = xsdbool( ms_sel-mbew_acc1 = 'X' OR ms_sel-mbew_acc2 = 'X' ).
    ms_head-warehouse_view = xsdbool( ms_sel-mlgn_whm1 = 'X' OR ms_sel-mlgt_whm2 = 'X' ).
    ms_head-cost_view      = xsdbool( ms_sel-marc_cost1 = 'X' OR ms_sel-mbew_cost2 = 'X' ).
    ms_head-purchase_view  = xsdbool( ms_sel-marc_purc = 'X' ).
    ms_head-forecast_view  = xsdbool( ms_sel-prop_forc = 'X' OR ms_sel-prop_cons = 'X' ).
    ms_head-quality_view   = xsdbool( ms_sel-qmat_qm = 'X' ).

    " ---- client data
%%MARA%%
    ms_mara_b-authoritygroup = ls_mara-mtart.
    set_flags( EXPORTING is_data = ms_mara_b CHANGING cs_x = ms_mara_x ).

    " ---- plant data
    IF ls_marc-werks IS NOT INITIAL.
%%MARC%%
      ms_marc_b-profit_ctr = |{ ls_marc-prctr ALPHA = IN }|.
      ms_marc_b-ind_post_to_insp_stock = ls_marc-insmk.
      IF ls_mara-mtart = 'WIP'.
        SELECT SINGLE pcode FROM zmdm_matgr WHERE werks = @ls_marc-werks INTO @DATA(lv_pcode).
        IF sy-subrc = 0.
          ms_marc_b-mat_grp_trans = lv_pcode && |{ mv_matnr ALPHA = OUT }|.
        ENDIF.
      ENDIF.
      set_flags( EXPORTING is_data = ms_marc_b CHANGING cs_x = ms_marc_x ).
    ENDIF.

    " ---- storage location
    IF ls_marc-werks IS NOT INITIAL AND ls_mard-lgort IS NOT INITIAL.
%%MARD%%
      ms_mard_b-stge_loc = ls_mard-lgort.
      set_flags( EXPORTING is_data = ms_mard_b CHANGING cs_x = ms_mard_x ).
    ENDIF.

    " ---- valuation (defaults of the material type / plant from ZMM_MDM, as the old code did)
    IF ls_marc-werks IS NOT INITIAL AND ( ls_mbew-vprsv IS NOT INITIAL OR ls_mbew-bklas IS NOT INITIAL OR ls_mbew-stprs IS NOT INITIAL OR ls_mbew-verpr IS NOT INITIAL ).
%%MBEW%%
      DATA(lv_werks) = COND werks_d( WHEN ls_marc-werks(2) = 'DP' OR ls_marc-werks(2) = '3P' THEN ls_marc-werks(2) && '99' ELSE ls_marc-werks ).
      SELECT SINGLE * FROM zmm_mdm WHERE mtart = @ls_mara-mtart AND werks = @lv_werks AND bwtar = @mv_bwtar_key INTO @DATA(ls_mdm).
      IF sy-subrc = 0.
        ms_mbew_b-price_ctrl = ls_mdm-vprsv.
        ms_mbew_b-val_class  = ls_mdm-bklas.
        ms_mbew_b-val_cat    = ls_mdm-bwtty.
      ENDIF.
      IF mv_val_type IS NOT INITIAL.
        ms_mbew_b-val_type = mv_val_type.
      ENDIF.
      set_flags( EXPORTING is_data = ms_mbew_b CHANGING cs_x = ms_mbew_x ).
    ENDIF.

    " ---- warehouse, storage type
    IF ls_mlgn-lgnum IS NOT INITIAL.
%%MLGN%%
      set_flags( EXPORTING is_data = ms_mlgn_b CHANGING cs_x = ms_mlgn_x ).
    ENDIF.
    IF ls_mlgt-lgnum IS NOT INITIAL AND ls_mlgt-lgtyp IS NOT INITIAL.
%%MLGT%%
      set_flags( EXPORTING is_data = ms_mlgt_b CHANGING cs_x = ms_mlgt_x ).
    ENDIF.

    " ---- sales
    IF ls_mvke-vkorg IS NOT INITIAL.
%%MVKE%%
      set_flags( EXPORTING is_data = ms_mvke_b CHANGING cs_x = ms_mvke_x ).
    ENDIF.

    " ---- forecast parameters
    IF ls_marc-werks IS NOT INITIAL AND ms_head-forecast_view = abap_true.
%%MPOP%%
      set_flags( EXPORTING is_data = ms_mpop_b CHANGING cs_x = ms_mpop_x ).
    ENDIF.

    " ---- description
    IF ms-makt-maktx IS NOT INITIAL.
      APPEND VALUE #( langu = 'EN' langu_iso = 'EN' matl_desc = ms-makt-maktx ) TO mt_desc.
    ENDIF.

    " ---- tax classification: country row plus its tax types (up to nine)
    LOOP AT mt_mlan ASSIGNING FIELD-SYMBOL(<ml>).
      DATA ls_mlan_b TYPE bapi_mlan.
      CLEAR ls_mlan_b.
      ls_mlan_b-depcountry     = <ml>-aland.
      ls_mlan_b-depcountry_iso = <ml>-aland.
      DATA(lv_n) = 0.
      LOOP AT mt_stax ASSIGNING FIELD-SYMBOL(<sx>) WHERE aland = <ml>-aland.
        lv_n = lv_n + 1.
        CHECK lv_n <= 9.
        ASSIGN COMPONENT |TAX_TYPE_{ lv_n }| OF STRUCTURE ls_mlan_b TO FIELD-SYMBOL(<tt>).
        ASSIGN COMPONENT |TAXCLASS_{ lv_n }| OF STRUCTURE ls_mlan_b TO FIELD-SYMBOL(<tc>).
        IF <tt> IS ASSIGNED AND <tc> IS ASSIGNED.
          <tt> = <sx>-tatyp.
          <tc> = <sx>-taxkd.
        ENDIF.
      ENDLOOP.
      ls_mlan_b-tax_ind = ls_marc-taxim.
      APPEND ls_mlan_b TO mt_mlan_b.
    ENDLOOP.

    " ---- units of measure and EAN
    LOOP AT mt_marm ASSIGNING FIELD-SYMBOL(<mm>).
      DATA ls_marm_b TYPE bapi_marm.
      DATA ls_marm_x TYPE bapi_marmx.
      DATA(ls_marm_st) = <mm>.
      CLEAR: ls_marm_b, ls_marm_x.
%%MARM%%
      ls_marm_b-alt_unit_iso = ls_marm_b-alt_unit.
      ls_marm_b-unit_dim_iso = ls_marm_b-unit_dim.
      ls_marm_b-volumeunit_iso = ls_marm_b-volumeunit.
      ls_marm_b-unit_of_wt_iso = ls_marm_b-unit_of_wt.
      ls_marm_b-sub_uom_iso = ls_marm_b-sub_uom.
      set_flags( EXPORTING is_data = ls_marm_b CHANGING cs_x = ls_marm_x ).
      APPEND ls_marm_b TO mt_marm_b.
      APPEND ls_marm_x TO mt_marm_x.
    ENDLOOP.
    LOOP AT mt_mean ASSIGNING FIELD-SYMBOL(<me>).
      APPEND VALUE #( unit = <me>-meinh unit_iso = <me>-meinh ean_upc = <me>-ean11 ean_cat = <me>-eantp ) TO mt_mean_b.
    ENDLOOP.
  ENDMETHOD.


  METHOD call_bapi.
    "iv_test = abap_true: the BAPI runs and everything is rolled back, so only its messages remain
    DATA ls_return TYPE bapiret2.
    DATA lt_ret    TYPE STANDARD TABLE OF bapiret2 WITH EMPTY KEY.
    prepare( ).
    CALL FUNCTION 'BAPI_MATERIAL_SAVEDATA'
      EXPORTING
        headdata             = ms_head
        clientdata           = ms_mara_b
        clientdatax          = ms_mara_x
        plantdata            = ms_marc_b
        plantdatax           = ms_marc_x
        forecastparameters   = ms_mpop_b
        forecastparametersx  = ms_mpop_x
        storagelocationdata  = ms_mard_b
        storagelocationdatax = ms_mard_x
        valuationdata        = ms_mbew_b
        valuationdatax       = ms_mbew_x
        warehousenumberdata  = ms_mlgn_b
        warehousenumberdatax = ms_mlgn_x
        salesdata            = ms_mvke_b
        salesdatax           = ms_mvke_x
        storagetypedata      = ms_mlgt_b
        storagetypedatax     = ms_mlgt_x
      IMPORTING
        return               = ls_return
      TABLES
        materialdescription  = mt_desc
        unitsofmeasure       = mt_marm_b
        unitsofmeasurex      = mt_marm_x
        internationalartnos  = mt_mean_b
        taxclassifications   = mt_mlan_b
        returnmessages       = lt_ret.
    DATA(lt_msg) = VALUE zif_mm_mdm_types=>tt_msg(
      FOR r IN lt_ret WHERE ( type CA 'EAW' )
      ( code = |{ r-id }{ r-number }| message = r-message severity = r-type target = r-field ) ).
    IF ls_return-type CA 'EA' AND NOT line_exists( lt_msg[ severity = 'E' ] ) AND NOT line_exists( lt_msg[ severity = 'A' ] ).
      APPEND VALUE #( code = |{ ls_return-id }{ ls_return-number }| message = ls_return-message severity = 'E' ) TO lt_msg.
    ENDIF.
    IF line_exists( lt_msg[ severity = 'E' ] ) OR line_exists( lt_msg[ severity = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      zcx_mm_mdm=>raise_msgs( lt_msg ).
    ENDIF.
    IF iv_test = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
    ENDIF.
  ENDMETHOD.


  METHOD prepare.
    CASE mv_mode.
      WHEN 'X'. change_diff( ).
      WHEN 'E'. ext_build( ).
      WHEN OTHERS. build_bapi( ).
    ENDCASE.
  ENDMETHOD.


  METHOD diff_struct.
    "Keep only what differs from the base snapshot: unchanged fields are cleared and not flagged, changed fields are
    "flagged even when they are now blank (so a cleared field is cleared in SAP). Key fields of the X structure are kept.
    DATA(lo_d) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( cs_new ) ).
    LOOP AT lo_d->components ASSIGNING FIELD-SYMBOL(<c>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE cs_new TO FIELD-SYMBOL(<n>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE is_old TO FIELD-SYMBOL(<o>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE cs_x TO FIELD-SYMBOL(<f>).
      IF <n> IS NOT ASSIGNED OR <o> IS NOT ASSIGNED OR <f> IS NOT ASSIGNED.
        UNASSIGN: <n>, <o>, <f>.
        CONTINUE.
      ENDIF.
      DESCRIBE FIELD <f> LENGTH DATA(lv_len) IN CHARACTER MODE.
      IF lv_len > 1.
        <f> = <n>.
      ELSEIF <n> = <o>.
        CLEAR: <n>, <f>.
      ELSE.
        <f> = 'X'.
      ENDIF.
      UNASSIGN: <n>, <o>, <f>.
    ENDLOOP.
  ENDMETHOD.


  METHOD change_diff.
    "1. the base snapshot, as BAPI structures
    read_staging( zcl_mm_mdm_change=>base_id( mv_transid ) ).
    build_bapi( ).
    DATA(o_mara) = ms_mara_b.  DATA(o_marc) = ms_marc_b.  DATA(o_mard) = ms_mard_b.  DATA(o_mbew) = ms_mbew_b.
    DATA(o_mlgn) = ms_mlgn_b.  DATA(o_mlgt) = ms_mlgt_b.  DATA(o_mvke) = ms_mvke_b.  DATA(o_mpop) = ms_mpop_b.
    DATA(o_desc) = mt_desc.    DATA(o_marm) = mt_marm_b.  DATA(o_mean) = mt_mean_b.
    "2. the request as it is now
    read_staging( ).
    build_bapi( ).
    CLEAR: ms_mara_x, ms_marc_x, ms_mard_x, ms_mbew_x, ms_mlgn_x, ms_mlgt_x, ms_mvke_x, ms_mpop_x.
    diff_struct( EXPORTING is_old = o_mara CHANGING cs_new = ms_mara_b cs_x = ms_mara_x ).
    diff_struct( EXPORTING is_old = o_marc CHANGING cs_new = ms_marc_b cs_x = ms_marc_x ).
    diff_struct( EXPORTING is_old = o_mard CHANGING cs_new = ms_mard_b cs_x = ms_mard_x ).
    diff_struct( EXPORTING is_old = o_mbew CHANGING cs_new = ms_mbew_b cs_x = ms_mbew_x ).
    diff_struct( EXPORTING is_old = o_mlgn CHANGING cs_new = ms_mlgn_b cs_x = ms_mlgn_x ).
    diff_struct( EXPORTING is_old = o_mlgt CHANGING cs_new = ms_mlgt_b cs_x = ms_mlgt_x ).
    diff_struct( EXPORTING is_old = o_mvke CHANGING cs_new = ms_mvke_b cs_x = ms_mvke_x ).
    diff_struct( EXPORTING is_old = o_mpop CHANGING cs_new = ms_mpop_b cs_x = ms_mpop_x ).
    "descriptions, units and EAN: only when something differs
    IF mt_desc = o_desc.
      CLEAR mt_desc.
    ENDIF.
    DATA lt_keep_b TYPE STANDARD TABLE OF bapi_marm WITH EMPTY KEY.
    DATA lt_keep_x TYPE STANDARD TABLE OF bapi_marmx WITH EMPTY KEY.
    LOOP AT mt_marm_b ASSIGNING FIELD-SYMBOL(<mb>).
      DATA(lv_idx) = sy-tabix.
      DATA(ls_old) = VALUE #( o_marm[ alt_unit = <mb>-alt_unit ] OPTIONAL ).
      IF ls_old <> <mb>.
        APPEND <mb> TO lt_keep_b.
        APPEND mt_marm_x[ lv_idx ] TO lt_keep_x.
      ENDIF.
    ENDLOOP.
    mt_marm_b = lt_keep_b.  mt_marm_x = lt_keep_x.
    LOOP AT mt_mean_b ASSIGNING FIELD-SYMBOL(<me>).
      IF line_exists( o_mean[ unit = <me>-unit ean_upc = <me>-ean_upc ean_cat = <me>-ean_cat ] ).
        DELETE mt_mean_b.
      ENDIF.
    ENDLOOP.
    CLEAR mt_mlan_b.           "tax classification is not part of the change request yet
    "views that are posted: the ones the requester selected (the header flags from the build already follow ms_sel)
  ENDMETHOD.


  METHOD ext_kind.
    IF ms-marc-werks IS NOT INITIAL.
      SELECT SINGLE werks FROM marc WHERE matnr = @mv_matnr AND werks = @ms-marc-werks INTO @DATA(lv_w).
      IF sy-subrc <> 0. rv_kind = 'P'. RETURN. ENDIF.
    ENDIF.
    IF ms-mard-lgort IS NOT INITIAL.
      SELECT SINGLE lgort FROM mard WHERE matnr = @mv_matnr AND werks = @ms-mard-werks AND lgort = @ms-mard-lgort INTO @DATA(lv_l).
      IF sy-subrc <> 0. rv_kind = 'L'. RETURN. ENDIF.
    ENDIF.
    IF ms-mvke-vkorg IS NOT INITIAL.
      SELECT SINGLE vkorg FROM mvke WHERE matnr = @mv_matnr AND vkorg = @ms-mvke-vkorg AND vtweg = @ms-mvke-vtweg INTO @DATA(lv_s).
      IF sy-subrc <> 0. rv_kind = 'S'. RETURN. ENDIF.
    ENDIF.
    IF ms-mbew-bwtar IS NOT INITIAL.
      SELECT SINGLE bwtar FROM mbew WHERE matnr = @mv_matnr AND bwkey = @ms-mbew-bwkey AND bwtar = @ms-mbew-bwtar INTO @DATA(lv_v).
      IF sy-subrc <> 0. rv_kind = 'V'. RETURN. ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD ext_build.
    "Only the new organisational level is posted; the base data of the material is not touched
    DATA(lv_kind) = ext_kind( ).
    IF lv_kind IS INITIAL.
      zcx_mm_mdm=>raise_text( 'Nothing new to extend: the plant, storage location, sales area or valuation type already exists' ).
    ENDIF.
    build_bapi( ).
    CLEAR: ms_mara_b, ms_mara_x, mt_desc, mt_marm_b, mt_marm_x, mt_mean_b, mt_mlan_b, ms_mlgn_b, ms_mlgn_x, ms_mlgt_b, ms_mlgt_x.
    CASE lv_kind.
      WHEN 'S'.
        CLEAR: ms_marc_b, ms_marc_x, ms_mard_b, ms_mard_x, ms_mbew_b, ms_mbew_x, ms_mpop_b, ms_mpop_x.
      WHEN 'L'.
        CLEAR: ms_marc_b, ms_marc_x, ms_mbew_b, ms_mbew_x, ms_mpop_b, ms_mpop_x, ms_mvke_b, ms_mvke_x.
      WHEN 'V'.
        CLEAR: ms_marc_b, ms_marc_x, ms_mard_b, ms_mard_x, ms_mpop_b, ms_mpop_x, ms_mvke_b, ms_mvke_x.
      WHEN 'P'.
        CLEAR: ms_mvke_b, ms_mvke_x.
    ENDCASE.
    "view flags as the old extension posting set them (quality view not for plants 3P* and 4P*)
    CLEAR ms_head-basic_view.
    CLEAR: ms_head-sales_view, ms_head-mrp_view, ms_head-work_sched_view, ms_head-storage_view, ms_head-account_view,
           ms_head-warehouse_view, ms_head-cost_view, ms_head-purchase_view, ms_head-forecast_view, ms_head-quality_view.
    CASE lv_kind.
      WHEN 'S'. ms_head-sales_view = abap_true.
      WHEN 'L'. ms_head-storage_view = abap_true.
      WHEN 'V'. ms_head-account_view = abap_true.
      WHEN 'P'.
        ms_head-mrp_view = abap_true.  ms_head-storage_view = abap_true.  ms_head-account_view = abap_true.
        ms_head-cost_view = abap_true.  ms_head-purchase_view = abap_true.  ms_head-forecast_view = abap_true.
        ms_head-quality_view = xsdbool( ms-marc-werks(2) <> '3P' AND ms-marc-werks(2) <> '4P' ).
    ENDCASE.
  ENDMETHOD.


  METHOD post_change.
    read_staging( ).
    mv_matnr = ms-mara-matnr.
    IF mv_matnr IS INITIAL.
      zcx_mm_mdm=>raise_text( |Request { mv_transid ALPHA = OUT } has no material number| ).
    ENDIF.
    test_run( ).
    call_bapi( abap_false ).
    "follow-ups only for the views the requester selected
    IF ms_sel-mara_basic1 = 'X' OR ms_sel-mara_basic2 = 'X'.
      custom_fields( ).
    ENDIF.
    IF ms_sel-marc_ft_exp = 'X' OR ms_sel-marc_ft_imp = 'X' OR ms_sel-mvke_sorg_tax = 'X' OR ms_sel-mvke_sorg1_tax = 'X'.
      india_tax( ).
    ENDIF.
    IF ms_sel-mara_basic1 = 'X' OR ms_sel-mara_basic2 = 'X' OR ms_sel-mvke_sorg2 = 'X' OR ms_sel-marc_purc = 'X'.
      long_texts( ).
    ENDIF.
    IF ms_sel-rmcl_class = 'X'.
      classification( ).
    ENDIF.
    IF ms_sel-work_schedule = 'X'.
      prod_versions( ).
    ENDIF.
    IF ms_sel-qmat_qm = 'X'.
      inspection( ).
    ENDIF.
    IF ms_sel-marc_ft_imp = 'X'.
      preference_prices( ).
    ENDIF.
    IF ms_sel-marc_ft_exp = 'X'.
      legal_control( ).
    ENDIF.
    IF ms_sel-prop_forc = 'X' OR ms_sel-prop_cons = 'X'.
      forecast_values( ).
    ENDIF.
    mv_meta_status = 'CHA'.
    meta_row( ).
  ENDMETHOD.


  METHOD post_extension.
    read_staging( ).
    mv_matnr = ms-mara-matnr.
    IF mv_matnr IS INITIAL.
      zcx_mm_mdm=>raise_text( |Request { mv_transid ALPHA = OUT } has no material number| ).
    ENDIF.
    DATA(lv_kind) = ext_kind( ).
    test_run( ).
    call_bapi( abap_false ).
    IF lv_kind = 'P'.
      inspection( ).
      india_tax( ).
    ENDIF.
    IF lv_kind = 'P' OR lv_kind = 'S'.
      long_texts( ).
    ENDIF.
    mv_meta_status = 'EA'.
  ENDMETHOD.


  METHOD step1_number_and_attachments.
    "internal number (or the number typed for an externally numbered type), stored on the request header
    DATA lt_nr TYPE STANDARD TABLE OF bapimatinr WITH EMPTY KEY.
    DATA(lv_mtart) = ms-mara-mtart.
    SELECT SINGLE numki, numke FROM t134 WHERE mtart = @lv_mtart INTO @DATA(ls_t134).
    DATA(lv_range) = COND #( WHEN ls_t134-numki IS NOT INITIAL THEN ls_t134-numki ELSE ls_t134-numke ).
    DATA(lv_ext) = abap_false.
    IF lv_range IS NOT INITIAL.
      SELECT SINGLE externind FROM nriv WHERE nrrangenr = @lv_range AND object = 'MATERIALNR' INTO @DATA(lv_externind).
      lv_ext = xsdbool( lv_externind = 'X' ).
    ENDIF.
    IF lv_ext = abap_true.
      mv_matnr = ms-mara-matnr.
      IF mv_matnr IS INITIAL.
        zcx_mm_mdm=>raise_text( |Material type { lv_mtart } needs the material number typed in (external number range)| ).
      ENDIF.
    ELSE.
      CALL FUNCTION 'BAPI_STDMATERIAL_GETINTNUMBER'
        EXPORTING
          material_type    = lv_mtart
          required_numbers = 1
        TABLES
          material_number  = lt_nr.
      mv_matnr = VALUE #( lt_nr[ 1 ]-material OPTIONAL ).
      IF mv_matnr IS INITIAL.
        zcx_mm_mdm=>raise_text( |No material number could be drawn for type { lv_mtart }| ).
      ENDIF.
    ENDIF.
    UPDATE /inowits/m_trans SET obj_value = @mv_matnr WHERE transid = @mv_transid.
    COMMIT WORK AND WAIT.
    "attachments and comments (DMS) are not ported yet
  ENDMETHOD.


  METHOD test_run.
    call_bapi( abap_true ).
  ENDMETHOD.


  METHOD step2_save_material.
    call_bapi( abap_false ).
    "Split valuation: a second call creates the valuation type with the defaults of that type (not for plants 3P*)
    DATA(ls_mbew) = ms-mbew.
    IF ls_mbew-bwtar IS NOT INITIAL AND ms-marc-werks(2) <> '3P'.
      mv_bwtar_key = COND #( WHEN ms-marc-werks <> ls_mbew-bwtar AND ls_mbew-bwtar <> 'EXT' AND ls_mbew-bwtar <> 'EH00' AND ms-marc-werks(2) <> 'UB'
                             THEN 'XXXX' ELSE ls_mbew-bwtar ).
      mv_val_type = ls_mbew-bwtar.
      call_bapi( abap_false ).
      CLEAR: mv_val_type, mv_bwtar_key.
    ENDIF.
  ENDMETHOD.


  METHOD fail_on_return.
    DATA(lt_msg) = VALUE zif_mm_mdm_types=>tt_msg(
      FOR r IN it_return WHERE ( type CA 'EA' ) ( code = |{ r-id }{ r-number }| message = |{ iv_what }: { r-message }| severity = 'E' target = r-field ) ).
    IF lt_msg IS NOT INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      zcx_mm_mdm=>raise_msgs( lt_msg ).
    ENDIF.
  ENDMETHOD.


  METHOD step3_repl_and_vers.
    custom_fields( ).
    replica( ).
    prod_versions( ).
  ENDMETHOD.


  METHOD custom_fields.
    "The custom (Z) fields of MARA and the product hierarchy levels are not part of BAPI_MATERIAL_SAVEDATA; the old code
    "wrote them with UPDATE. The Z fields are taken from the staging row by name, the derived ones as before.
    DATA ls_z TYPE mara.
    DATA lt_set TYPE STANDARD TABLE OF string WITH EMPTY KEY.
    DATA(ls_s) = ms-mara.
    DATA(lv_prdha) = CONV char18( ls_s-prdha ).
    ls_z = CORRESPONDING #( ls_s ).
    ls_z-matnr = mv_matnr.

    CASE ls_s-mtart.
      WHEN 'ROH'.
        SELECT SINGLE rm_type_desc FROM zrm_sub_type WHERE zzrm_type = @ls_s-zzrm_type INTO @ls_z-rm_type_desc.
        ls_z-zzp_version = '0'.  ls_z-zzparent_code = '1'.  ls_z-zzparent_mat = mv_matnr.
      WHEN 'PKGN'.
        SELECT * FROM mara
          WHERE zzmtype_code = @ls_s-zzmtype_code AND zzmstype_code = @ls_s-zzmstype_code AND zzdist_code = @ls_s-zzdist_code
            AND zzmsource = @ls_s-zzmsource AND zzorigin_code = @ls_s-zzorigin_code AND matkl = @ls_s-matkl
            AND zzrmpm_country = @ls_s-zzrmpm_country AND zzpack_code = @ls_s-zzpack_code AND zzpack_unit = @ls_s-zzpack_unit
            AND zzbrand_code = @ls_s-zzbrand_code AND zzsub_brand = @ls_s-zzsub_brand AND zzprod_form = @ls_s-zzprod_form
            AND zzpromo_brand = @ls_s-zzpromo_brand AND zzpromo_sub_brand = @ls_s-zzpromo_sub_brand
            AND zzpromo_pack = @ls_s-zzpromo_pack AND zzpromo_pack_unit = @ls_s-zzpromo_pack_unit
            AND matnr <> @mv_matnr
          INTO TABLE @DATA(lt_pm).
        IF lt_pm IS NOT INITIAL.
          SORT lt_pm BY zzp_version DESCENDING.
          ls_z-zzp_version = '0'.
          ls_z-zzparent_mat = lt_pm[ 1 ]-zzparent_mat.
        ELSE.
          ls_z-zzp_version = '0'.  ls_z-zzparent_code = '1'.  ls_z-zzparent_mat = mv_matnr.
        ENDIF.
      WHEN 'FERT' OR 'FRT2'.
        SELECT design_c FROM zmlddsgn_mdm WHERE transid = @mv_transid AND design_c <> @space INTO TABLE @DATA(lt_design).
        IF lt_design IS NOT INITIAL.
          ls_z-zzfg_code = mv_matnr.
        ENDIF.
        ls_z-zbanner = lv_prdha(2).   ls_z-level1 = lv_prdha(2).
        ls_z-zbrand  = lv_prdha(6).   ls_z-level2 = lv_prdha+2(4).
        ls_z-level3  = lv_prdha+6(4).
        ls_z-zsku    = lv_prdha(13).  ls_z-level4 = lv_prdha+10(3).
        ls_z-zvariant = lv_prdha(16). ls_z-level5 = lv_prdha+13(3).
        IF ls_z-zmvgr5 IS INITIAL AND lv_prdha(10) IS NOT INITIAL.
          SELECT SINGLE zmvgr5 FROM t179 WHERE prodh = @lv_prdha(10) AND stufe = '3' INTO @ls_z-zmvgr5.
        ENDIF.
        IF ls_z-zmvgr5 IS NOT INITIAL.
          SELECT SINGLE bezei FROM zem_season WHERE zmvgr5 = @ls_z-zmvgr5 INTO @ls_z-bezei.
        ENDIF.
    ENDCASE.
    IF ls_s-mtart = 'WIP'.
      lt_set = VALUE #( ( `ZBUSINESS` ) ).
    ELSE.
      DATA(lo_d) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( ls_z ) ).
      LOOP AT lo_d->components ASSIGNING FIELD-SYMBOL(<c>).
        IF <c>-name(1) = 'Z' OR <c>-name = 'LEVEL1' OR <c>-name = 'LEVEL2' OR <c>-name = 'LEVEL3' OR <c>-name = 'LEVEL4'
           OR <c>-name = 'LEVEL5' OR <c>-name = 'BEZEI' OR <c>-name = 'RM_TYPE_DESC'.
          ASSIGN COMPONENT <c>-name OF STRUCTURE ls_s TO FIELD-SYMBOL(<in_staging>).
          CHECK sy-subrc = 0 OR <c>-name CP 'LEVEL*' OR <c>-name = 'BEZEI' OR <c>-name = 'RM_TYPE_DESC'.
          APPEND CONV string( <c>-name ) TO lt_set.
        ENDIF.
      ENDLOOP.
      IF lv_prdha(10) IS NOT INITIAL.
        ls_z-prodha = lv_prdha(10).
        APPEND `PRODHA` TO lt_set.
      ENDIF.
    ENDIF.
    CHECK lt_set IS NOT INITIAL.
    SELECT SINGLE * FROM mara WHERE matnr = @mv_matnr INTO @DATA(ls_cur).
    CHECK sy-subrc = 0.
    LOOP AT lt_set ASSIGNING FIELD-SYMBOL(<n>).
      ASSIGN COMPONENT <n> OF STRUCTURE ls_z TO FIELD-SYMBOL(<from>).
      ASSIGN COMPONENT <n> OF STRUCTURE ls_cur TO FIELD-SYMBOL(<to>).
      IF <from> IS ASSIGNED AND <to> IS ASSIGNED.
        <to> = <from>.
      ENDIF.
      UNASSIGN: <from>, <to>.
    ENDLOOP.
    UPDATE mara FROM @ls_cur.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD replica.
    "Replenishment parameters of the receiving customer (retail), only when a customer is on the request
    CHECK ms-mara-kunnr IS NOT INITIAL.
    SELECT SINGLE * FROM /inowits/mm_wrpl WHERE transid = @mv_transid INTO @DATA(ls_wrpl).
    DATA ls_i TYPE bapi_wrpl_import.
    DATA ls_x TYPE bapi_wrpl_importx.
    DATA lt_i TYPE STANDARD TABLE OF bapi_wrpl_import WITH EMPTY KEY.
    DATA lt_x TYPE STANDARD TABLE OF bapi_wrpl_importx WITH EMPTY KEY.
    DATA lt_ret TYPE bapiret2_t.
    ls_i-recipient = ms-mara-kunnr.  ls_i-material = mv_matnr.
    ls_i-mrp_type = COND #( WHEN ls_wrpl-sobst IS NOT INITIAL THEN ls_wrpl-sobst ELSE ms-marc-dismm ).
    ls_i-reorder_pt = ms-marc-minbe.  ls_i-safety_stk = ms-marc-eisbe.
    ls_i-target_range_of_coverage = ls_wrpl-trcov.
    ls_i-minimum_target_stock = ls_wrpl-prwug.  ls_i-maximum_target_stock = ls_wrpl-prwog.
    ls_i-use_rpl_based_inventory_mgmt = ls_wrpl-nimgt.  ls_i-only_include_goods_issues = ls_wrpl-ngrct.
    set_flags( EXPORTING is_data = ls_i CHANGING cs_x = ls_x ).
    APPEND ls_i TO lt_i.  APPEND ls_x TO lt_x.
    CALL FUNCTION 'BAPI_RTMAT_RPL_SAVEREPLICAMULT'
      TABLES recipientparameters = lt_i recipientparametersx = lt_x return = lt_ret.
    fail_on_return( it_return = lt_ret iv_what = 'Replenishment parameters' ).
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD prod_versions.
    "Production versions (work schedule view) of the plant
    SELECT * FROM /inowits/mm_ws_v WHERE transid = @mv_transid INTO TABLE @DATA(lt_ws).
    CHECK lt_ws IS NOT INITIAL AND ms-marc-werks IS NOT INITIAL.
    SELECT SINGLE * FROM /inowits/mm_mkal WHERE transid = @mv_transid INTO @DATA(ls_base).
    DATA lt_i TYPE STANDARD TABLE OF mkal WITH EMPTY KEY.
    DATA lt_u TYPE STANDARD TABLE OF mkal WITH EMPTY KEY.
    DATA lt_d TYPE STANDARD TABLE OF mkal WITH EMPTY KEY.
    DATA lt_a TYPE STANDARD TABLE OF mkal_aend WITH EMPTY KEY.
    LOOP AT lt_ws ASSIGNING FIELD-SYMBOL(<w>).
      DATA ls_mkal TYPE mkal.
      CLEAR ls_mkal.
      MOVE-CORRESPONDING ls_base TO ls_mkal.
      MOVE-CORRESPONDING <w> TO ls_mkal.
      ls_mkal-matnr = mv_matnr.  ls_mkal-werks = ms-marc-werks.  ls_mkal-mandt = sy-mandt.
      APPEND ls_mkal TO lt_i.
      <w>-matnr = mv_matnr.  <w>-werks = ms-marc-werks.
    ENDLOOP.
    CALL FUNCTION 'CM_FV_PROD_VERS_DB_UPDATE' TABLES it_mkal_i = lt_i it_mkal_u = lt_u it_mkal_d = lt_d it_mkal_aend = lt_a.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
    MODIFY /inowits/mm_ws_v FROM TABLE @lt_ws.
    UPDATE /inowits/cm_meta SET matnr = @mv_matnr, status = 'CA' WHERE transid = @mv_transid.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD step4_tax_class_texts.
    india_tax( ).
    long_texts( ).
    classification( ).
  ENDMETHOD.


  METHOD india_tax.
    "Chapter ID (HSN), assessable value and MODVAT details of the plant, from the excise staging row
    SELECT SINGLE * FROM /inowits/mm_exse WHERE transid = @mv_transid INTO @DATA(ls_exse).
    IF sy-subrc <> 0 OR ms-marc-werks IS INITIAL.
      RETURN.
    ENDIF.
    DATA ls_chid TYPE j_1imtchid.
    DATA ls_assv TYPE j_1iassval.
    DATA ls_modd TYPE j_1imoddet.
    DATA lt_chid TYPE STANDARD TABLE OF j_1imtchid WITH EMPTY KEY.
    DATA lt_assv TYPE STANDARD TABLE OF j_1iassval WITH EMPTY KEY.
    DATA lt_modd_ins TYPE STANDARD TABLE OF j_1imoddet WITH EMPTY KEY.
    DATA lt_modd_upd TYPE STANDARD TABLE OF j_1imoddet WITH EMPTY KEY.
    DATA lt_modd_old TYPE STANDARD TABLE OF j_1imoddet WITH EMPTY KEY.
    MOVE-CORRESPONDING ls_exse TO ls_chid.
    MOVE-CORRESPONDING ls_exse TO ls_assv.
    MOVE-CORRESPONDING ls_exse TO ls_modd.
    ls_chid-matnr = mv_matnr.      ls_chid-werks = ms-marc-werks.
    ls_assv-j_1imatnr = mv_matnr.  ls_assv-j_1iwerks = ms-marc-werks.
    ls_modd-j_1imoim = mv_matnr.   ls_modd-werks = ms-marc-werks.
    APPEND ls_chid TO lt_chid.
    APPEND ls_assv TO lt_assv.

    SELECT SINGLE matnr FROM j_1imtchid WHERE matnr = @mv_matnr AND werks = @ms-marc-werks INTO @DATA(lv_x1).
    IF sy-subrc = 0.
      CALL FUNCTION 'J_1IMTCHID_POST' TABLES ti_j_1imtchid_upd = lt_chid EXCEPTIONS post_error = 1 OTHERS = 2.
    ELSE.
      CALL FUNCTION 'J_1IMTCHID_POST' TABLES ti_j_1imtchid_ins = lt_chid EXCEPTIONS post_error = 1 OTHERS = 2.
    ENDIF.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |India tax (chapter ID) could not be posted for material { mv_matnr ALPHA = OUT }| ).
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.

    SELECT SINGLE j_1imatnr FROM j_1iassval WHERE j_1iwerks = @ms-marc-werks AND j_1imatnr = @mv_matnr INTO @DATA(lv_x2).
    IF sy-subrc = 0.
      CALL FUNCTION 'J_1IASSVAL_POST' TABLES ti_j_1iassval_upd = lt_assv EXCEPTIONS post_error = 1 OTHERS = 2.
    ELSE.
      CALL FUNCTION 'J_1IASSVAL_POST' TABLES ti_j_1iassval_ins = lt_assv EXCEPTIONS post_error = 1 OTHERS = 2.
    ENDIF.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |India tax (assessable value) could not be posted for material { mv_matnr ALPHA = OUT }| ).
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.

    SELECT SINGLE j_1imoim FROM j_1imoddet WHERE werks = @ms-marc-werks AND j_1imoim = @mv_matnr INTO @DATA(lv_x3).
    IF sy-subrc = 0.
      APPEND ls_modd TO lt_modd_upd.
    ELSE.
      APPEND ls_modd TO lt_modd_ins.
    ENDIF.
    CALL FUNCTION 'J_1IMODDET_POST'
      TABLES ti_j_1imoddet_upd = lt_modd_upd ti_j_1imoddet_ins = lt_modd_ins ti_oj_1imoddet = lt_modd_old.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD long_texts.
    "Long texts: sales text (MVKE), purchase order text (MDTXT) and the basic texts (MATERIAL)
    SELECT * FROM /inowits/mm_text WHERE transid = @mv_transid INTO TABLE @DATA(lt_text).
    LOOP AT lt_text ASSIGNING FIELD-SYMBOL(<t>) WHERE text IS NOT INITIAL.
      DATA(lv_matnr) = COND matnr( WHEN <t>-matnr IS INITIAL THEN mv_matnr ELSE <t>-matnr ).
      DATA(lv_obj) = SWITCH tdobject( <t>-fid WHEN '0001' THEN 'MVKE' WHEN 'LTXT' THEN 'MDTXT' ELSE 'MATERIAL' ).
      DATA(lv_name) = SWITCH tdobname( <t>-fid
        WHEN '0001' THEN |{ lv_matnr }{ ms-mvke-vkorg }{ ms-mvke-vtweg }|
        WHEN 'LTXT' THEN |{ lv_matnr }{ ms-marc-werks }|
        ELSE |{ lv_matnr }| ).
      DATA lt_tline TYPE STANDARD TABLE OF tline WITH EMPTY KEY.
      CLEAR lt_tline.
      CALL FUNCTION 'VB_CP_CONVERT_STRING_2_ITF' EXPORTING i_string = <t>-text TABLES et_table = lt_tline.
      CALL FUNCTION 'CREATE_TEXT'
        EXPORTING fid = <t>-fid flanguage = 'E' fname = lv_name fobject = lv_obj
        TABLES flines = lt_tline
        EXCEPTIONS no_init = 1 no_save = 2 OTHERS = 3.
      IF sy-subrc <> 0.
        zcx_mm_mdm=>raise_text( |Long text { <t>-fid } could not be saved for material { mv_matnr ALPHA = OUT }| ).
      ENDIF.
    ENDLOOP.
    IF lt_text IS NOT INITIAL.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.


  METHOD step5_inspection_and_trade.
    inspection( ).
    preference_prices( ).
    legal_control( ).
    forecast_values( ).
  ENDMETHOD.


  METHOD inspection.
    "Quality inspection setup per inspection type
    SELECT * FROM /inowits/mm_qmat WHERE transid = @mv_transid AND art <> @space INTO TABLE @DATA(lt_q).
    CHECK lt_q IS NOT INITIAL.
    SELECT * FROM tq34 INTO TABLE @DATA(lt_tq34).
    DATA lt_insp TYPE STANDARD TABLE OF bapi1001004_qmat WITH EMPTY KEY.
    DATA lt_ret TYPE bapiret2_t.
    LOOP AT lt_q ASSIGNING FIELD-SYMBOL(<q>).
      DATA(ls_i) = VALUE bapi1001004_qmat(
        function = '009' insptype = <q>-art material = mv_matnr plant = ms-marc-werks
        ind_insp_with_tsk_list = <q>-ppl ind_spec_matspec = <q>-spezueber ind_spec_config = <q>-conf ind_spec_batch = <q>-tls
        ind_auto_assign = <q>-app ind_insp_by_charac = <q>-mer ind_post_to_insp_stock = 'X' ind_automatic_ud = <q>-ave
        sampling_procedure = <q>-stichprver dyn_modif_rule = <q>-dynregel insp_percentage = <q>-sproz
        ind_100_percent_inspection = <q>-hpz ind_skips_allowed = <q>-dyn ind_manual_sample = <q>-mpb
        ind_manual_sample_calc = <q>-mst ind_single_units_possible = <q>-ein ave_insp_duration = <q>-mpdau
        contr_insp_lot_create = <q>-chg allowed_scrap_share = <q>-qpmat ind_special_qm_order = <q>-kzprfkost
        qm_orderid = <q>-aufnr_co ind_insptype_mat_active = <q>-aktiv preferred_insptype = <q>-apa ms_flag = <q>-ms_flag ).
      ls_i-qual_score_procedure = VALUE #( lt_tq34[ art = <q>-art ]-qkzverf OPTIONAL ).
      APPEND ls_i TO lt_insp.
    ENDLOOP.
    CALL FUNCTION 'BAPI_MATINSPCTRL_SAVEREPLICA' TABLES return = lt_ret inspectionctrl = lt_insp.
    fail_on_return( it_return = lt_ret iv_what = 'Inspection setup' ).
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD preference_prices.
    SELECT * FROM /inowits/mm_mape WHERE transid = @mv_transid INTO TABLE @DATA(lt_mape).
    CHECK lt_mape IS NOT INITIAL.
    DATA lt_x TYPE STANDARD TABLE OF mape WITH EMPTY KEY.
    DATA ls_marc TYPE marc.
    ls_marc-matnr = mv_matnr.  ls_marc-werks = ms-marc-werks.
    LOOP AT lt_mape ASSIGNING FIELD-SYMBOL(<p>).
      DATA ls_x TYPE mape.
      CLEAR ls_x.
      MOVE-CORRESPONDING <p> TO ls_x.
      ls_x-matnr = mv_matnr.  ls_x-werks = ms-marc-werks.  ls_x-mandt = sy-mandt.
      APPEND ls_x TO lt_x.
    ENDLOOP.
    CALL FUNCTION 'PREFERENCE_PRICE_UPDATE' EXPORTING xprefe = 'A' xmarc = ls_marc TABLES xmape = lt_x.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD legal_control.
    SELECT * FROM /inowits/mm_maex WHERE transid = @mv_transid INTO TABLE @DATA(lt_maex).
    CHECK lt_maex IS NOT INITIAL.
    DATA lt_v TYPE STANDARD TABLE OF maex WITH EMPTY KEY.
    LOOP AT lt_maex ASSIGNING FIELD-SYMBOL(<m>).
      DATA ls_v TYPE maex.
      CLEAR ls_v.
      MOVE-CORRESPONDING <m> TO ls_v.
      ls_v-aland = 'IN'.  ls_v-mandt = sy-mandt.  ls_v-matnr = mv_matnr.
      APPEND ls_v TO lt_v.
    ENDLOOP.
    CALL FUNCTION 'MAEX_SAVE'
      EXPORTING flgmaex_exi = ' ' matnr = mv_matnr aland = 'IN'
      TABLES vmaex = lt_v
      EXCEPTIONS maex_delete_error = 1 maex_insert_error = 2 OTHERS = 3.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |Export control data could not be saved for material { mv_matnr ALPHA = OUT }| ).
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD step6_variants_and_keys.
    variants( ).
    meta_row( ).
    phonetic_keys( ).
  ENDMETHOD.


  METHOD classification.
    "Classes of the material and their characteristic values (BAPI_OBJCL_CREATE, then BAPI_OBJCL_CHANGE)
    SELECT * FROM /inowits/mm_rmcl WHERE transid = @mv_transid ORDER BY class, sr_no INTO TABLE @DATA(lt_rmcl).
    CHECK lt_rmcl IS NOT INITIAL.
    DATA lt_classes LIKE lt_rmcl.
    lt_classes = lt_rmcl.
    DELETE ADJACENT DUPLICATES FROM lt_classes COMPARING class.
    DATA(lv_obj) = CONV bapi1003_key-object( mv_matnr ).
    LOOP AT lt_classes ASSIGNING FIELD-SYMBOL(<k>).
      DATA lt_ret TYPE bapiret2_t.
      CLEAR lt_ret.
      CALL FUNCTION 'BAPI_OBJCL_CREATE'
        EXPORTING objectkeynew = lv_obj objecttablenew = 'MARA' classnumnew = <k>-class standardclass = <k>-stdcl
                  classtypenew = <k>-klart status = '1' keydate = sy-datum
        TABLES return = lt_ret.
      "an error here is tolerated: on a retry the class is already assigned; the value call below reports real problems
      IF line_exists( lt_ret[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
      ENDIF.
      DATA lt_char TYPE STANDARD TABLE OF bapi1003_alloc_values_char WITH EMPTY KEY.
      DATA lt_num  TYPE STANDARD TABLE OF bapi1003_alloc_values_num WITH EMPTY KEY.
      DATA lt_curr TYPE STANDARD TABLE OF bapi1003_alloc_values_curr WITH EMPTY KEY.
      CLEAR: lt_char, lt_num, lt_curr.
      LOOP AT lt_rmcl ASSIGNING FIELD-SYMBOL(<r>) WHERE class = <k>-class AND atnam IS NOT INITIAL.
        SELECT SINGLE atfor FROM cabn WHERE atnam = @<r>-atnam INTO @DATA(lv_atfor).
        CASE lv_atfor.
          WHEN 'NUM'.
            APPEND VALUE #( charact = <r>-atnam value_from = <r>-atwrt instance = '000' ) TO lt_num.
          WHEN 'CHAR'.
            APPEND VALUE #( charact = <r>-atnam value_char = <r>-atwrt value_neutral = <r>-atwrt instance = '000' ) TO lt_char.
          WHEN 'CURR'.
            APPEND VALUE #( charact = <r>-atnam value_from = <r>-atwrt instance = '000' ) TO lt_curr.
        ENDCASE.
      ENDLOOP.
      IF lt_char IS NOT INITIAL OR lt_num IS NOT INITIAL OR lt_curr IS NOT INITIAL.
        CLEAR lt_ret.
        CALL FUNCTION 'BAPI_OBJCL_CHANGE'
          EXPORTING objectkey = lv_obj objecttable = 'MARA' classnum = <k>-class classtype = <k>-klart
                    standardclass = <k>-stdcl keydate = sy-datum
          TABLES allocvaluesnumnew = lt_num allocvaluescharnew = lt_char allocvaluescurrnew = lt_curr return = lt_ret.
        fail_on_return( it_return = lt_ret iv_what = |Class { <k>-class } values| ).
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD first_day.
    "Period text of the screen to the first day of the period; the period indicator of the plant says how it is written
    DATA(lv_per) = CONV string( iv_per ).
    CONDENSE lv_per.
    CASE iv_perkz.
      WHEN 'M'.
        REPLACE FIRST OCCURRENCE OF 'M' IN lv_per WITH ` ` IGNORING CASE.
        CONDENSE lv_per.
        SPLIT lv_per AT '.' INTO DATA(lv_m) DATA(lv_y).
        CONDENSE: lv_m, lv_y.
        rv_date = |{ lv_y }{ lv_m WIDTH = 2 ALIGN = RIGHT PAD = `0` }01|.
      WHEN 'W'.
        REPLACE FIRST OCCURRENCE OF 'W' IN lv_per WITH ` ` IGNORING CASE.
        CONDENSE lv_per.
        SPLIT lv_per AT '.' INTO lv_m lv_y.
        CONDENSE: lv_m, lv_y.
        DATA(lv_week) = CONV scal-week( |{ lv_y }{ lv_m WIDTH = 2 ALIGN = RIGHT PAD = `0` }| ).
        CALL FUNCTION 'WEEK_GET_FIRST_DAY' EXPORTING week = lv_week IMPORTING date = rv_date EXCEPTIONS OTHERS = 1.
      WHEN 'T'.
        IF strlen( lv_per ) >= 10.
          rv_date = |{ lv_per+6(4) }{ lv_per+3(2) }{ lv_per(2) }|.
        ENDIF.
      WHEN 'P'.
        REPLACE FIRST OCCURRENCE OF 'P' IN lv_per WITH ` ` IGNORING CASE.
        CONDENSE lv_per.
        IF lv_per CS '/'.
          SPLIT lv_per AT '/' INTO lv_m lv_y.
        ELSE.
          SPLIT lv_per AT '.' INTO lv_m lv_y.
        ENDIF.
        CONDENSE: lv_m, lv_y.
        rv_date = |{ lv_y }{ lv_m WIDTH = 2 ALIGN = RIGHT PAD = `0` }01|.
    ENDCASE.
  ENDMETHOD.


  METHOD forecast_values.
    "Forecast values and consumption (period based), a second BAPI call as in the old code
    DATA(lv_perkz) = ms-marc-perkz.
    CHECK lv_perkz IS NOT INITIAL AND ms-marc-werks IS NOT INITIAL.
    SELECT * FROM /inowits/mm_cons WHERE transid = @mv_transid INTO TABLE @DATA(lt_cons).
    SELECT * FROM /inowits/mm_prow WHERE transid = @mv_transid INTO TABLE @DATA(lt_prow).
    CHECK lt_cons IS NOT INITIAL OR lt_prow IS NOT INITIAL.
    DATA lt_head TYPE STANDARD TABLE OF bapie1matheader WITH EMPTY KEY.
    DATA lt_mara TYPE STANDARD TABLE OF bapie1mara WITH EMPTY KEY.
    DATA lt_marax TYPE STANDARD TABLE OF bapie1marax WITH EMPTY KEY.
    DATA lt_fc TYPE STANDARD TABLE OF bapie1mprw WITH EMPTY KEY.
    DATA lt_uc TYPE STANDARD TABLE OF bapie1mveu WITH EMPTY KEY.
    DATA lt_tc TYPE STANDARD TABLE OF bapie1mveg WITH EMPTY KEY.
    DATA ls_ret TYPE bapiret2.
    APPEND VALUE #( function = 'UPD' material = mv_matnr ind_sector = ms-mara-mbrsh matl_type = ms-mara-mtart forecast_view = 'X' ) TO lt_head.
    APPEND VALUE #( function = 'UPD' material = mv_matnr matl_group = ms-mara-matkl base_uom = ms-mara-meins ) TO lt_mara.
    APPEND VALUE #( function = 'UPD' material = mv_matnr matl_group = COND #( WHEN ms-mara-matkl IS NOT INITIAL THEN 'X' )
                    base_uom = COND #( WHEN ms-mara-meins IS NOT INITIAL THEN 'X' ) ) TO lt_marax.
    LOOP AT lt_cons ASSIGNING FIELD-SYMBOL(<c>).
      DATA(lv_day) = first_day( iv_perkz = lv_perkz iv_per = <c>-priod ).
      IF <c>-vbwrt IS NOT INITIAL OR <c>-kovbw IS NOT INITIAL.
        APPEND VALUE #( function = 'UPD' material = mv_matnr plant = ms-marc-werks first_day = lv_day
                        cons_value = <c>-vbwrt corr_value = <c>-kovbw ) TO lt_uc.
      ENDIF.
      IF <c>-vbwrt1 IS NOT INITIAL OR <c>-kovbw1 IS NOT INITIAL.
        APPEND VALUE #( function = 'UPD' material = mv_matnr plant = ms-marc-werks first_day = lv_day
                        cons_value = <c>-vbwrt1 corr_value = <c>-kovbw1 ) TO lt_tc.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_prow ASSIGNING FIELD-SYMBOL(<p>).
      APPEND VALUE #( function = 'UPD' material = mv_matnr plant = ms-marc-werks first_day = first_day( iv_perkz = lv_perkz iv_per = <p>-per01 )
                      fore_value = <p>-opwrt corr_value = <p>-kpwrt cvalue_fxd = <p>-flgfx ) TO lt_fc.
    ENDLOOP.
    CALL FUNCTION 'BAPI_MATERIAL_SAVEREPLICA'
      EXPORTING noappllog = 'X' nochangedoc = ' ' testrun = ' ' inpfldcheck = ' '
      IMPORTING return = ls_ret
      TABLES headdata = lt_head clientdata = lt_mara clientdatax = lt_marax
             forecastvalues = lt_fc unplndconsumption = lt_uc totalconsumption = lt_tc.
    fail_on_return( it_return = VALUE #( ( ls_ret ) ) iv_what = 'Forecast and consumption values' ).
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.
  ENDMETHOD.


  METHOD variants.
    "Variants of a configurable material
    SELECT * FROM /inowits/mdm_var WHERE transid = @mv_transid INTO TABLE @DATA(lt_var).
    CHECK lt_var IS NOT INITIAL.
    DATA lt_v TYPE STANDARD TABLE OF /inowits/mdm_var_st WITH EMPTY KEY.
    LOOP AT lt_var ASSIGNING FIELD-SYMBOL(<v>).
      DATA ls_v TYPE /inowits/mdm_var_st.
      CLEAR ls_v.
      MOVE-CORRESPONDING <v> TO ls_v.
      ls_v-matnr = mv_matnr.
      APPEND ls_v TO lt_v.
    ENDLOOP.
    CALL FUNCTION '/INOWITS/MM_VARIANTS'
      EXPORTING material = mv_matnr conf_matl = ms-mara-satnr conf_matl_plant = ms-marc-stdpd
                plant = ms-marc-werks lt_variants = lt_v lv_meins = ms-mara-meins.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD meta_row.
    "One row per material for the duplicate search (the old code deleted and inserted by material number)
    DATA ls_meta TYPE /inowits/cm_meta.
    DELETE FROM /inowits/cm_meta WHERE matnr = @mv_matnr.
    ls_meta-mandt = sy-mandt.  ls_meta-transid = mv_transid.  ls_meta-matnr = mv_matnr.
    ls_meta-maktx = ms-makt-maktx.  ls_meta-tot_descr = ms-makt-maktx.  ls_meta-mtart = ms-mara-mtart.
    ls_meta-meins = ms-mara-meins.  ls_meta-bismt = ms-mara-bismt.  ls_meta-prdha = ms-mara-prdha.
    ls_meta-mfrnr = ms-mara-mfrnr.  ls_meta-mfrpn = ms-mara-mfrpn.  ls_meta-matkl = ms-mara-matkl.
    ls_meta-status = mv_meta_status.
    MODIFY /inowits/cm_meta FROM @ls_meta.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD phonetic_keys.
    "Phonetic codes of the description and manufacturer part, for the duplicate check (up to four words)
    SELECT SINGLE value FROM /inowits/ph_d_m WHERE value = @mv_matnr INTO @DATA(lv_dup).
    CHECK sy-subrc <> 0.
    SELECT SINGLE maktx FROM makt WHERE matnr = @mv_matnr AND spras = 'E' INTO @DATA(lv_desc).
    SELECT SINGLE mfrpn FROM mara WHERE matnr = @mv_matnr INTO @DATA(lv_manu).
    DATA lt_codes TYPE STANDARD TABLE OF string WITH EMPTY KEY.
    DATA lv_scode TYPE string.
    DATA lv_chars TYPE i.
    IF lv_desc IS NOT INITIAL.
      lv_desc = to_upper( condense( lv_desc ) ).
      SPLIT lv_desc AT space INTO TABLE DATA(lt_words).
      SORT lt_words.
      DATA(lv_count) = lines( lt_words ).
      LOOP AT lt_words ASSIGNING FIELD-SYMBOL(<w>) WHERE table_line IS NOT INITIAL.
        CLEAR lv_chars.
        CALL FUNCTION '/INOWITS/STR_NUM_LENGTH' EXPORTING str = <w> IMPORTING char_count = lv_chars.
        IF lv_chars <= 2 OR <w> CO '1234567890'.
          IF lv_count = 1.
            CLEAR lv_scode.
            CALL FUNCTION '/INOWITS/P_PHONETICS' EXPORTING iv_wordstring = <w> iv_lengthoption = 3 iv_app = 'MC' IMPORTING scode = lv_scode.
            IF lv_scode IS NOT INITIAL. APPEND lv_scode TO lt_codes. ENDIF.
          ENDIF.
          CONTINUE.
        ENDIF.
        CLEAR lv_scode.
        CALL FUNCTION '/INOWITS/P_PHONETICS' EXPORTING iv_wordstring = <w> iv_lengthoption = 3 iv_app = 'MC' IMPORTING scode = lv_scode.
        IF lv_scode IS NOT INITIAL AND lines( lt_codes ) < 4.
          APPEND lv_scode TO lt_codes.
        ENDIF.
      ENDLOOP.
    ENDIF.
    DATA lv_manu_code TYPE string.
    IF lv_manu IS NOT INITIAL.
      CALL FUNCTION '/INOWITS/P_PHONETICS' EXPORTING iv_wordstring = lv_manu iv_lengthoption = 3 iv_app = 'MC' IMPORTING scode = lv_manu_code.
    ENDIF.
    DATA ls_f TYPE /inowits/ph_d_m.
    DATA lt_f TYPE STANDARD TABLE OF /inowits/ph_d_m WITH EMPTY KEY.
    ls_f-mandt = sy-mandt.  ls_f-app_id = 'MC'.  ls_f-desc_mat = lv_desc.  ls_f-mat_type = ms-mara-mtart.  ls_f-manu_part = lv_manu.
    ls_f-scode  = VALUE #( lt_codes[ 1 ] OPTIONAL ).
    ls_f-scode1 = VALUE #( lt_codes[ 2 ] OPTIONAL ).
    ls_f-scode2 = VALUE #( lt_codes[ 3 ] OPTIONAL ).
    ls_f-scode3 = VALUE #( lt_codes[ 4 ] OPTIONAL ).
    ls_f-scode4 = lv_manu_code.
    ls_f-value = mv_matnr.      APPEND ls_f TO lt_f.
    ls_f-value = mv_transid.    APPEND ls_f TO lt_f.
    MODIFY /inowits/ph_d_m FROM TABLE @lt_f.
    COMMIT WORK AND WAIT.
  ENDMETHOD.
ENDCLASS.
