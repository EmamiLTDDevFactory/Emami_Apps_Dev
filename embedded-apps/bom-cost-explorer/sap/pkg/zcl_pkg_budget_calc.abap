CLASS zcl_pkg_budget_calc DEFINITION
  PUBLIC
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES:
      ty_val TYPE p LENGTH 16 DECIMALS 8 .
    TYPES:
      tt_scen TYPE STANDARD TABLE OF zpkg_s_scen WITH DEFAULT KEY .
    TYPES:
      tt_item TYPE STANDARD TABLE OF zpkg_s_item WITH DEFAULT KEY .
    TYPES:
      tt_ovr  TYPE STANDARD TABLE OF zpkg_s_ovr WITH DEFAULT KEY .
    TYPES:
      ty_r_id TYPE RANGE OF zpkg_bud_scen-scen_id .

    CONSTANTS c_werks TYPE werks_d VALUE 'HO00' ##NO_TEXT.
    CONSTANTS c_ekorg TYPE ekorg VALUE 'CPD' ##NO_TEXT.
    CONSTANTS c_group_curr TYPE waers VALUE 'INR' ##NO_TEXT.
    CONSTANTS c_prio TYPE c LENGTH 40 VALUE 'INFOREC,CONSUMP,MBEW' ##NO_TEXT.

    METHODS constructor
      IMPORTING
        !iv_email TYPE ad_smtpadr .
    "No authorisation object / PFCG role is used for packing budget: always passes.
    METHODS auth
      IMPORTING
        !iv_action TYPE csequence
      RAISING
        zcx_pkg_bud .
    METHODS execute
      CHANGING
        !cs_act TYPE zpkg_s_action
      RAISING
        zcx_pkg_bud .
    METHODS scen_list
      IMPORTING
        !ir_id         TYPE ty_r_id
      RETURNING
        VALUE(rt_scen) TYPE tt_scen .
    METHODS item_list
      IMPORTING
        !iv_id         TYPE zpkg_bud_scen-scen_id
      RETURNING
        VALUE(rt_item) TYPE tt_item .
    METHODS ovr_list
      IMPORTING
        !iv_id        TYPE zpkg_bud_scen-scen_id
      RETURNING
        VALUE(rt_ovr) TYPE tt_ovr .

  PRIVATE SECTION.

    TYPES:
      BEGIN OF ty_it,
        matnr           TYPE matnr,
        werks           TYPE werks_d,
        idnrk           TYPE matnr,
        maktx           TYPE maktx,
        mtart           TYPE mtart,
        matkl           TYPE matkl,
        meins           TYPE meins,
        peinh           TYPE peinh,
        waers           TYPE waers,
        rate_src        TYPE c LENGTH 10,
        origin_grp      TYPE hrkft,
        zbud_matnr      TYPE matnr,
        alt_bom_used    TYPE stlal,
        basic_rate_sap  TYPE ty_val,
        basic_rate_used TYPE ty_val,
        pct_sap         TYPE ty_val,
        zbud_sap        TYPE ty_val,
        zbud_used       TYPE ty_val,
        comp_base_rate  TYPE ty_val,
        comp_bud_rate   TYPE ty_val,
        budget_rate     TYPE ty_val,
        budget_rate_sap TYPE ty_val,
        variance        TYPE ty_val,
        variance_pct    TYPE ty_val,
        group_curr      TYPE waers,
        group_value     TYPE ty_val,
        frt_cond1       TYPE kschl,
        frt_cond2       TYPE kschl,
        frt_cond3       TYPE kschl,
        frt_cond4       TYPE kschl,
        frt_rate1       TYPE ty_val,
        frt_rate2       TYPE ty_val,
        frt_rate3       TYPE ty_val,
        frt_rate4       TYPE ty_val,
        frt_total       TYPE ty_val,
        frt_curr        TYPE waers,
        landed_rate     TYPE ty_val,
        landed_curr     TYPE waers,
        flags           TYPE c LENGTH 60,
        written_key     TYPE c LENGTH 1,
      END OF ty_it .
    TYPES:
      tt_it TYPE SORTED TABLE OF ty_it WITH UNIQUE KEY matnr werks idnrk .
    TYPES:
      BEGIN OF ty_mat,
        matnr      TYPE matnr,
        mtart      TYPE mtart,
        matkl      TYPE matkl,
        meins      TYPE meins,
        werks      TYPE werks_d,
        hrkft      TYPE hrkft,
      END OF ty_mat .
    TYPES:
      BEGIN OF ty_txt,
        matnr TYPE matnr,
        maktx TYPE maktx,
      END OF ty_txt .
    TYPES:
      BEGIN OF ty_src,
        matnr      TYPE matnr,
        rate_src   TYPE c LENGTH 10,
        plant      TYPE werks_d,
        rate       TYPE ty_val,
        curr       TYPE waers,
        peinh      TYPE peinh,
        uom        TYPE meins,
        valid_from TYPE d,
        valid_to   TYPE d,
        doc        TYPE ebeln,
        item       TYPE ebelp,
      END OF ty_src .
    TYPES:
      BEGIN OF ty_zb,
        hrkft TYPE hrkft,
        matnr TYPE matnr,
      END OF ty_zb .
    TYPES:
      BEGIN OF ty_comp,
        hrkft TYPE hrkft,
        idnrk TYPE matnr,
        meins TYPE meins,
        pct   TYPE ty_val,
        stlal TYPE stlal,
        zbud  TYPE matnr,
      END OF ty_comp .
    TYPES:
      BEGIN OF ty_zbud,
        matnr TYPE matnr,
        datab TYPE d,
        datbi TYPE d,
        kbetr TYPE konp-kbetr,
      END OF ty_zbud .
    TYPES:
      BEGIN OF ty_frt,
        matnr    TYPE matnr,
        werks    TYPE werks_d,
        condtype TYPE kschl,
        podate   TYPE d,
        currency TYPE waers,
        actamt   TYPE p LENGTH 15 DECIMALS 2,
        actqty   TYPE p LENGTH 13 DECIMALS 3,
      END OF ty_frt .
    TYPES:
      BEGIN OF ty_pf,
        pct  TYPE ty_val,
        f    TYPE ty_val,
        cbr  TYPE ty_val,
        cbud TYPE ty_val,
      END OF ty_pf .
    TYPES:
      tt_pf TYPE STANDARD TABLE OF ty_pf WITH DEFAULT KEY .
    TYPES:
      BEGIN OF ty_dec,
        waers TYPE waers,
        dec   TYPE i,
      END OF ty_dec .
    TYPES:
      BEGIN OF ty_fx,
        waers  TYPE waers,
        factor TYPE ty_val,
      END OF ty_fx .
    TYPES:
      BEGIN OF ty_tag,
        matkl TYPE c LENGTH 70,
        prio  TYPE c LENGTH 40,
        base  TYPE c LENGTH 10,
      END OF ty_tag .

    DATA mv_email TYPE ad_smtpadr .
    DATA ms_act TYPE zpkg_s_action .
    DATA ms_s TYPE zpkg_bud_scen .
    DATA mt_dec TYPE HASHED TABLE OF ty_dec WITH UNIQUE KEY waers .
    DATA mt_fx TYPE HASHED TABLE OF ty_fx WITH UNIQUE KEY waers .

    METHODS err
      IMPORTING
        !iv_text TYPE string
      RAISING
        zcx_pkg_bud .
    METHODS load_scen
      RAISING
        zcx_pkg_bud .
    METHODS chk_status
      IMPORTING
        !iv_ok TYPE string
      RAISING
        zcx_pkg_bud .
    METHODS set_status
      IMPORTING
        !iv_id     TYPE zpkg_bud_scen-scen_id
        !iv_status TYPE c .
    METHODS next_id
      RETURNING
        VALUE(rv) TYPE zpkg_bud_scen-scen_id
      RAISING
        zcx_pkg_bud .
    METHODS next_ver
      IMPORTING
        !iv_from  TYPE d
        !iv_to    TYPE d
      RETURNING
        VALUE(rv) TYPE zpkg_bud_scen-version .
    METHODS fy
      IMPORTING
        !iv_date  TYPE d
      RETURNING
        VALUE(rv) TYPE gjahr .
    METHODS curr_dec
      IMPORTING
        !iv_waers TYPE waers
      RETURNING
        VALUE(rv) TYPE i .
    METHODS fx_factor
      IMPORTING
        !iv_waers   TYPE waers
        !iv_date    TYPE d
      RETURNING
        VALUE(rv)   TYPE ty_val .
    METHODS mat_in
      IMPORTING
        !iv       TYPE string
      RETURNING
        VALUE(rv) TYPE matnr .
    METHODS to_range
      IMPORTING
        !iv_list TYPE csequence
        !iv_mat  TYPE abap_bool OPTIONAL
      CHANGING
        !ct_rng  TYPE STANDARD TABLE .
    METHODS log
      IMPORTING
        !iv_id    TYPE zpkg_bud_scen-scen_id
        !iv_event TYPE csequence
        !iv_text  TYPE csequence .
    METHODS tag_get
      IMPORTING
        !iv_text  TYPE csequence
      RETURNING
        VALUE(rs) TYPE ty_tag .
    METHODS tag_put
      IMPORTING
        !is_tag   TYPE ty_tag
      RETURNING
        VALUE(rv) TYPE string .
    METHODS items_load
      IMPORTING
        !iv_id TYPE zpkg_bud_scen-scen_id
      EXPORTING
        !et_it TYPE tt_it .
    METHODS items_save
      IMPORTING
        !iv_id TYPE zpkg_bud_scen-scen_id
        !it_it TYPE tt_it .
    METHODS flags_text
      IMPORTING
        !is_db    TYPE zpkg_bud_item
      RETURNING
        VALUE(rv) TYPE string .
    METHODS create
      RAISING
        zcx_pkg_bud .
    METHODS build_items
      IMPORTING
        !is_s  TYPE zpkg_bud_scen
      EXPORTING
        !et_it TYPE tt_it .
    METHODS calculate
      IMPORTING
        !iv_id TYPE zpkg_bud_scen-scen_id .
    METHODS calc_one
      IMPORTING
        !iv_rate TYPE ty_val
        !iv_norm TYPE c
        !iv_dec  TYPE i
      EXPORTING
        !ev_br   TYPE ty_val
        !ev_sum  TYPE ty_val
      CHANGING
        !ct_pf   TYPE tt_pf .
    METHODS apply_rule
      IMPORTING
        !iv_rule  TYPE c
        !iv_cur   TYPE ty_val
        !iv_val   TYPE zpkg_val
      RETURNING
        VALUE(rv) TYPE ty_val .
    METHODS add_ovr
      IMPORTING
        !iv_level TYPE c
        !iv_matnr TYPE matnr
        !iv_idnrk TYPE matnr
        !iv_scope TYPE c
        !iv_rule  TYPE c
        !iv_val   TYPE zpkg_val
        !is_it    TYPE ty_it OPTIONAL .
    METHODS targets
      IMPORTING
        !it_it    TYPE tt_it
        !iv_matnr TYPE string
        !iv_matkl TYPE matkl
        !iv_idnrk TYPE matnr
      EXPORTING
        !et_mat   TYPE STANDARD TABLE .
    METHODS edit
      RAISING
        zcx_pkg_bud .
    METHODS revert
      RAISING
        zcx_pkg_bud .
    METHODS copy
      RAISING
        zcx_pkg_bud .
    METHODS submit
      RAISING
        zcx_pkg_bud .
    METHODS finalize
      RAISING
        zcx_pkg_bud .
    METHODS delete_scen
      RAISING
        zcx_pkg_bud .
    METHODS reopen
      RAISING
        zcx_pkg_bud .
    METHODS write_in
      IMPORTING
        !is_h TYPE ty_it
      RAISING
        zcx_pkg_bud .
    METHODS write_n
      IMPORTING
        !is_h    TYPE ty_it
        !iv_land TYPE land1
      RAISING
        zcx_pkg_bud .
ENDCLASS.



CLASS zcl_pkg_budget_calc IMPLEMENTATION.


  METHOD constructor.
    mv_email = to_lower( iv_email ).
  ENDMETHOD.


  METHOD auth.
    "intentionally empty: no auth object / PFCG role for packing budget
  ENDMETHOD.


  METHOD err.
    RAISE EXCEPTION TYPE zcx_pkg_bud
      EXPORTING
        iv_text = iv_text.
  ENDMETHOD.


  METHOD execute.
    ms_act = cs_act.
    TRANSLATE ms_act-werks TO UPPER CASE.
    IF ms_act-werks IS INITIAL. ms_act-werks = c_werks. ENDIF.
    CASE ms_act-action.
      WHEN 'CREATE'.   create( ).
      WHEN 'EDIT'.     edit( ).
      WHEN 'REVERT'.   revert( ).
      WHEN 'RECALC'.
        load_scen( ). chk_status( 'DC' ).
        calculate( ms_s-scen_id ).
        log( iv_id = ms_s-scen_id iv_event = 'CALC' iv_text = 'Recalculated' ).
        ms_act-msg = 'Scenario recalculated'.
      WHEN 'COPY'.     copy( ).
      WHEN 'SUBMIT'.   submit( ).
      WHEN 'FINALIZE'. finalize( ).
      WHEN 'DELETE'.   delete_scen( ).
      WHEN 'REOPEN'.   reopen( ).
      WHEN OTHERS.     err( |Unknown action { ms_act-action }| ).
    ENDCASE.
    cs_act = ms_act.
  ENDMETHOD.


  METHOD tag_get.
    DATA: lt TYPE STANDARD TABLE OF string, lv TYPE string, lv_k TYPE string, lv_v TYPE string.
    SPLIT iv_text AT ';' INTO TABLE lt.
    LOOP AT lt INTO lv.
      SPLIT lv AT '=' INTO lv_k lv_v.
      CASE lv_k.
        WHEN 'MATKL'. rs-matkl = lv_v.
        WHEN 'PRIO'.  rs-prio = lv_v.
        WHEN 'BASE'.  rs-base = lv_v.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.


  METHOD tag_put.
    rv = |MATKL={ is_tag-matkl };PRIO={ is_tag-prio };BASE={ is_tag-base }|.
  ENDMETHOD.


  METHOD scen_list.
    DATA: lt TYPE STANDARD TABLE OF zpkg_bud_scen, ls TYPE zpkg_bud_scen, lo TYPE zpkg_s_scen, ls_tag TYPE ty_tag.
    SELECT * FROM zpkg_bud_scen INTO TABLE lt WHERE scen_id IN ir_id.
    SORT lt BY version DESCENDING scen_id DESCENDING.
    LOOP AT lt INTO ls.
      CLEAR lo.
      ls_tag = tag_get( ls-origin_grp_sel ).
      lo-scen_id = ls-scen_id. lo-descr = ls-descr. lo-budget_year = ls-gjahr.
      lo-key_date = ls-key_date. lo-valid_from = ls-valid_from. lo-valid_to = ls-valid_to.
      lo-werks = ls-plant_sel. IF lo-werks IS INITIAL. lo-werks = c_werks. ENDIF.
      lo-status = ls-status. lo-budget_version = ls-version.
      lo-base_scen_id = ls_tag-base. lo-norm = ls-normalize_pct.
      lo-prio = ls_tag-prio. IF lo-prio IS INITIAL. lo-prio = c_prio. ENDIF.
      lo-filters = |MTART={ ls-mtart_sel };MATKL={ ls_tag-matkl };MATNR={ ls-matnr_sel }|.
      lo-created_by = ls-created_by. lo-created_on = ls-created_on. lo-created_tm = ls-created_tm.
      lo-changed_by = ls-changed_by. lo-changed_on = ls-changed_on. lo-changed_tm = ls-changed_tm.
      lo-final_by = ls-final_by. lo-final_on = ls-final_on. lo-final_tm = ls-final_tm.
      APPEND lo TO rt_scen.
    ENDLOOP.
  ENDMETHOD.


  METHOD flags_text.
    IF is_db-flag_nobom   = 'X'. rv = |{ rv } NOBOM|.   ENDIF.
    IF is_db-flag_pct100  = 'X'. rv = |{ rv } PCT100|.  ENDIF.
    IF is_db-flag_norate  = 'X'. rv = |{ rv } NORATE|.  ENDIF.
    IF is_db-flag_nozbud  = 'X'. rv = |{ rv } NOZBUD|.  ENDIF.
    IF is_db-flag_dup     = 'X'. rv = |{ rv } DUP|.     ENDIF.
    IF is_db-flag_nofrt   = 'X'. rv = |{ rv } NOFRT|.   ENDIF.
    CONDENSE rv.
  ENDMETHOD.


  METHOD item_list.
    DATA: lt TYPE STANDARD TABLE OF zpkg_bud_item, ls TYPE zpkg_bud_item, lo TYPE zpkg_s_item,
          ls_s TYPE zpkg_bud_scen, lt_m TYPE STANDARD TABLE OF ty_mat, ls_m TYPE ty_mat,
          lt_k TYPE STANDARD TABLE OF matnr, lv_k TYPE matnr, lv_f TYPE string.
    SELECT SINGLE * FROM zpkg_bud_scen INTO ls_s WHERE scen_id = iv_id.
    SELECT * FROM zpkg_bud_item INTO TABLE lt WHERE scen_id = iv_id.
    LOOP AT lt INTO ls WHERE row_level = 'H'.
      APPEND ls-matnr TO lt_k.
    ENDLOOP.
    IF lt_k IS NOT INITIAL.
      SELECT matnr mtart matkl meins INTO CORRESPONDING FIELDS OF TABLE lt_m
        FROM mara FOR ALL ENTRIES IN lt_k WHERE matnr = lt_k-table_line.
      SORT lt_m BY matnr.
    ENDIF.
    LOOP AT lt INTO ls.
      CLEAR lo.
      lo-scen_id = ls-scen_id. lo-matnr = ls-matnr. lo-idnrk = ls-component_matnr. lo-werks = ls-werks.
      lo-maktx = ls-maktx. lo-peinh = ls-price_unit. lo-waers = ls-currency. lo-meins = ls-base_uom.
      READ TABLE lt_m INTO ls_m WITH KEY matnr = ls-matnr BINARY SEARCH.
      IF sy-subrc = 0. lo-mtart = ls_m-mtart. lo-matkl = ls_m-matkl. ENDIF.
      lv_f = flags_text( ls ).
      IF ls-row_level = 'H'.
        lo-basic_rate_sap = ls-r_sap. lo-basic_rate_used = ls-r_used.
        lo-budget_rate = ls-br. lo-variance = ls-variance. lo-variance_pct = ls-variance_pct.
        lo-msg_flags = lv_f.
        lo-msg_base = lv_f.
        REPLACE ALL OCCURRENCES OF 'PCT100' IN lo-msg_base WITH ''.
        REPLACE ALL OCCURRENCES OF 'NORATE' IN lo-msg_base WITH ''.
        CONDENSE lo-msg_base.
        lo-gjahr = ls_s-gjahr. lo-valid_from = ls_s-valid_from. lo-valid_to = ls_s-valid_to.
        lo-origin_grp = ls-origin_grp. lo-zbud_matnr = ls-zbud_matnr. lo-alt_bom_used = ls-alt_bom_used.
        lo-group_curr = ls-group_curr. lo-group_value = ls-group_value.
        lo-frt_cond1 = ls-frt_cond1. lo-frt_cond2 = ls-frt_cond2. lo-frt_cond3 = ls-frt_cond3. lo-frt_cond4 = ls-frt_cond4.
        lo-frt_rate1 = ls-frt_rate1. lo-frt_rate2 = ls-frt_rate2. lo-frt_rate3 = ls-frt_rate3. lo-frt_rate4 = ls-frt_rate4.
        lo-frt_total = ls-frt_total. lo-frt_curr = ls-frt_curr. lo-landed_rate = ls-landed_rate. lo-landed_curr = ls-landed_curr.
        IF ls-written_key = 'X'. lo-target_table = 'WRITTEN'. ENDIF.
      ELSE.
        lo-pct_sap = ls-p_sap. lo-pct_used = ls-p_sap. lo-zbud_sap = ls-f_sap. lo-zbud_used = ls-f_used.
        lo-comp_base_rate = ls-cbr. lo-comp_bud_rate = ls-cbud.
        lo-msg_flags = lv_f. lo-msg_base = lv_f.
      ENDIF.
      APPEND lo TO rt_item.
    ENDLOOP.
    CLEAR lv_k.
  ENDMETHOD.


  METHOD ovr_list.
    DATA: lt TYPE STANDARD TABLE OF zpkg_bud_ovr, ls TYPE zpkg_bud_ovr, lo TYPE zpkg_s_ovr.
    SELECT * FROM zpkg_bud_ovr INTO TABLE lt WHERE scen_id = iv_id.
    SORT lt BY seq.
    LOOP AT lt INTO ls.
      CLEAR lo.
      lo-scen_id = ls-scen_id. lo-ovr_id = ls-seq. lo-matnr = ls-matnr. lo-idnrk = ls-component_matnr.
      CASE ls-zlevel.
        WHEN 'F'. lo-ovr_level = 'Z'.
        WHEN OTHERS. lo-ovr_level = ls-zlevel.
      ENDCASE.
      CASE ls-zrule.
        WHEN 'SET'. lo-ovr_rule = 'S'.
        WHEN 'PCT'. lo-ovr_rule = 'P'.
        WHEN 'ABS'. lo-ovr_rule = 'A'.
      ENDCASE.
      lo-old_value = ls-old_value. lo-new_value = ls-new_value.
      lo-ovr_user = ls-ovr_by. lo-ovr_date = ls-ovr_date. lo-ovr_time = ls-ovr_time.
      APPEND lo TO rt_ovr.
    ENDLOOP.
  ENDMETHOD.


  METHOD items_load.
    DATA: lt TYPE STANDARD TABLE OF zpkg_bud_item, ls TYPE zpkg_bud_item, lo TYPE ty_it,
          lt_m TYPE STANDARD TABLE OF ty_mat, ls_m TYPE ty_mat, lt_k TYPE STANDARD TABLE OF matnr.
    CLEAR et_it.
    SELECT * FROM zpkg_bud_item INTO TABLE lt WHERE scen_id = iv_id.
    LOOP AT lt INTO ls WHERE row_level = 'H'.
      APPEND ls-matnr TO lt_k.
    ENDLOOP.
    IF lt_k IS NOT INITIAL.
      SELECT matnr mtart matkl meins INTO CORRESPONDING FIELDS OF TABLE lt_m
        FROM mara FOR ALL ENTRIES IN lt_k WHERE matnr = lt_k-table_line.
      SORT lt_m BY matnr.
    ENDIF.
    LOOP AT lt INTO ls.
      CLEAR lo.
      lo-matnr = ls-matnr. lo-werks = ls-werks. lo-idnrk = ls-component_matnr. lo-maktx = ls-maktx.
      lo-origin_grp = ls-origin_grp. lo-zbud_matnr = ls-zbud_matnr. lo-alt_bom_used = ls-alt_bom_used.
      lo-peinh = ls-price_unit. lo-waers = ls-currency. lo-meins = ls-base_uom.
      READ TABLE lt_m INTO ls_m WITH KEY matnr = ls-matnr BINARY SEARCH.
      IF sy-subrc = 0. lo-mtart = ls_m-mtart. lo-matkl = ls_m-matkl. ENDIF.
      IF ls-row_level = 'H'.
        lo-basic_rate_sap = ls-r_sap. lo-basic_rate_used = ls-r_used. lo-budget_rate = ls-br.
        lo-variance = ls-variance. lo-variance_pct = ls-variance_pct.
        lo-group_curr = ls-group_curr. lo-group_value = ls-group_value.
        lo-frt_cond1 = ls-frt_cond1. lo-frt_cond2 = ls-frt_cond2. lo-frt_cond3 = ls-frt_cond3. lo-frt_cond4 = ls-frt_cond4.
        lo-frt_rate1 = ls-frt_rate1. lo-frt_rate2 = ls-frt_rate2. lo-frt_rate3 = ls-frt_rate3. lo-frt_rate4 = ls-frt_rate4.
        lo-frt_total = ls-frt_total. lo-frt_curr = ls-frt_curr.
        lo-landed_rate = ls-landed_rate. lo-landed_curr = ls-landed_curr.
        lo-written_key = ls-written_key.
      ELSE.
        lo-pct_sap = ls-p_sap. lo-zbud_sap = ls-f_sap. lo-zbud_used = ls-f_used.
        lo-comp_base_rate = ls-cbr. lo-comp_bud_rate = ls-cbud.
      ENDIF.
      lo-flags = flags_text( ls ).
      INSERT lo INTO TABLE et_it.
    ENDLOOP.
  ENDMETHOD.


  METHOD items_save.
    DATA: lt TYPE STANDARD TABLE OF zpkg_bud_item, ls TYPE zpkg_bud_item.
    FIELD-SYMBOLS <i> TYPE ty_it.
    LOOP AT it_it ASSIGNING <i>.
      CLEAR ls.
      ls-scen_id = iv_id. ls-matnr = <i>-matnr. ls-werks = <i>-werks. ls-component_matnr = <i>-idnrk.
      ls-maktx = <i>-maktx. ls-currency = <i>-waers. ls-price_unit = <i>-peinh. ls-base_uom = <i>-meins.
      IF <i>-flags CS 'NOBOM'.  ls-flag_nobom  = 'X'. ENDIF.
      IF <i>-flags CS 'PCT100'. ls-flag_pct100 = 'X'. ENDIF.
      IF <i>-flags CS 'NORATE'. ls-flag_norate = 'X'. ENDIF.
      IF <i>-flags CS 'NOZBUD'. ls-flag_nozbud = 'X'. ENDIF.
      IF <i>-flags CS 'DUP'.    ls-flag_dup    = 'X'. ENDIF.
      IF <i>-flags CS 'NOFRT'.  ls-flag_nofrt  = 'X'. ENDIF.
      IF <i>-idnrk IS INITIAL.
        ls-row_level = 'H'. ls-origin_grp = <i>-origin_grp. ls-zbud_matnr = <i>-zbud_matnr.
        ls-alt_bom_used = <i>-alt_bom_used.
        ls-r_sap = <i>-basic_rate_sap. ls-r_used = <i>-basic_rate_used. ls-br = <i>-budget_rate.
        ls-variance = <i>-variance. ls-variance_pct = <i>-variance_pct.
        ls-group_curr = <i>-group_curr. ls-group_value = <i>-group_value.
        ls-frt_cond1 = <i>-frt_cond1. ls-frt_cond2 = <i>-frt_cond2. ls-frt_cond3 = <i>-frt_cond3. ls-frt_cond4 = <i>-frt_cond4.
        ls-frt_rate1 = <i>-frt_rate1. ls-frt_rate2 = <i>-frt_rate2. ls-frt_rate3 = <i>-frt_rate3. ls-frt_rate4 = <i>-frt_rate4.
        ls-frt_total = <i>-frt_total. ls-frt_curr = <i>-frt_curr.
        ls-landed_rate = <i>-landed_rate. ls-landed_curr = <i>-landed_curr.
        ls-written_key = <i>-written_key.
      ELSE.
        ls-row_level = 'C'. ls-p_sap = <i>-pct_sap. ls-f_sap = <i>-zbud_sap. ls-f_used = <i>-zbud_used.
        ls-cbr = <i>-comp_base_rate. ls-cbud = <i>-comp_bud_rate.
      ENDIF.
      APPEND ls TO lt.
    ENDLOOP.
    DELETE FROM zpkg_bud_item WHERE scen_id = iv_id.
    IF lt IS NOT INITIAL.
      INSERT zpkg_bud_item FROM TABLE lt.
    ENDIF.
  ENDMETHOD.


  METHOD load_scen.
    SELECT SINGLE * FROM zpkg_bud_scen INTO ms_s WHERE scen_id = ms_act-scen_id.
    IF sy-subrc <> 0.
      err( |Scenario { ms_act-scen_id } not found| ).
    ENDIF.
  ENDMETHOD.


  METHOD chk_status.
    IF iv_ok NS ms_s-status.
      err( |Scenario status { ms_s-status } does not allow { ms_act-action }| ).
    ENDIF.
  ENDMETHOD.


  METHOD set_status.
    UPDATE zpkg_bud_scen SET status = iv_status changed_by = mv_email
           changed_on = sy-datum changed_tm = sy-uzeit WHERE scen_id = iv_id.
  ENDMETHOD.


  METHOD next_id.
    DATA lv_n TYPE n LENGTH 10.
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr = '01'
        object      = 'ZPKGBUD'
      IMPORTING
        number      = lv_n
      EXCEPTIONS
        OTHERS      = 1.
    IF sy-subrc <> 0.
      err( 'Number range ZPKGBUD (interval 01) not available' ).
    ENDIF.
    rv = lv_n.
  ENDMETHOD.


  METHOD next_ver.
    DATA lv_max TYPE zpkg_bud_scen-version.
    SELECT MAX( version ) FROM zpkg_bud_scen INTO lv_max
      WHERE valid_from = iv_from AND valid_to = iv_to.
    rv = lv_max + 1.
  ENDMETHOD.


  METHOD fy.
    DATA lv_periv TYPE t001-periv.
    SELECT SINGLE t~periv INTO lv_periv
      FROM t001w AS w INNER JOIN t001k AS k ON k~bwkey = w~bwkey
                      INNER JOIN t001  AS t ON t~bukrs = k~bukrs
      WHERE w~werks = c_werks.
    CALL FUNCTION 'DATE_TO_PERIOD_CONVERT'
      EXPORTING
        i_date  = iv_date
        i_periv = lv_periv
      IMPORTING
        e_gjahr = rv
      EXCEPTIONS
        OTHERS  = 1.
    IF sy-subrc <> 0.
      rv = iv_date(4).
    ENDIF.
  ENDMETHOD.


  METHOD curr_dec.
    DATA ls TYPE ty_dec.
    READ TABLE mt_dec INTO ls WITH TABLE KEY waers = iv_waers.
    IF sy-subrc <> 0.
      ls-waers = iv_waers.
      SELECT SINGLE currdec FROM tcurx INTO ls-dec WHERE currkey = iv_waers.
      IF sy-subrc <> 0. ls-dec = 2. ENDIF.
      INSERT ls INTO TABLE mt_dec.
    ENDIF.
    rv = ls-dec.
  ENDMETHOD.


  METHOD fx_factor.
    "1 unit of iv_waers in group currency on the key date (cached)
    DATA: ls TYPE ty_fx, lv_loc TYPE p LENGTH 15 DECIMALS 6.
    READ TABLE mt_fx INTO ls WITH TABLE KEY waers = iv_waers.
    IF sy-subrc <> 0.
      ls-waers = iv_waers.
      IF iv_waers IS INITIAL OR iv_waers = c_group_curr.
        ls-factor = 1.
      ELSE.
        CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
          EXPORTING
            date             = iv_date
            foreign_amount   = 1
            foreign_currency = iv_waers
            local_currency   = c_group_curr
            type_of_rate     = 'M'
          IMPORTING
            local_amount     = lv_loc
          EXCEPTIONS
            OTHERS           = 1.
        IF sy-subrc = 0.
          ls-factor = lv_loc.
        ELSE.
          ls-factor = 0.
        ENDIF.
      ENDIF.
      INSERT ls INTO TABLE mt_fx.
    ENDIF.
    rv = ls-factor.
  ENDMETHOD.


  METHOD mat_in.
    DATA lv TYPE matnr.
    lv = iv.
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING
        input  = lv
      IMPORTING
        output = rv
      EXCEPTIONS
        OTHERS = 1.
    IF sy-subrc <> 0. rv = lv. ENDIF.
  ENDMETHOD.


  METHOD to_range.
    DATA: lt TYPE STANDARD TABLE OF string, lv TYPE string.
    FIELD-SYMBOLS: <r> TYPE any, <f> TYPE any.
    SPLIT iv_list AT ',' INTO TABLE lt.
    LOOP AT lt INTO lv.
      CONDENSE lv.
      TRANSLATE lv TO UPPER CASE.
      IF lv IS INITIAL. CONTINUE. ENDIF.
      IF iv_mat = abap_true AND lv NS '*'.
        lv = mat_in( lv ).
      ENDIF.
      APPEND INITIAL LINE TO ct_rng ASSIGNING <r>.
      ASSIGN COMPONENT 'SIGN'   OF STRUCTURE <r> TO <f>. <f> = 'I'.
      ASSIGN COMPONENT 'OPTION' OF STRUCTURE <r> TO <f>.
      IF lv CS '*'. <f> = 'CP'. ELSE. <f> = 'EQ'. ENDIF.
      ASSIGN COMPONENT 'LOW'    OF STRUCTURE <r> TO <f>. <f> = lv.
    ENDLOOP.
  ENDMETHOD.


  METHOD log.
    DATA ls TYPE zpkg_bud_log.
    TRY.
        ls-log_id = cl_system_uuid=>create_uuid_c32_static( ).
      CATCH cx_uuid_error.
        RETURN.
    ENDTRY.
    ls-scen_id = iv_id. ls-event = iv_event. ls-log_text = iv_text.
    ls-log_user = mv_email. ls-log_date = sy-datum. ls-log_time = sy-uzeit.
    INSERT zpkg_bud_log FROM ls.
  ENDMETHOD.


  METHOD apply_rule.
    CASE iv_rule.
      WHEN 'SET'. rv = iv_val.
      WHEN 'PCT'. rv = iv_cur * ( 100 + iv_val ) / 100.
      WHEN 'ABS'. rv = iv_cur + iv_val.
      WHEN OTHERS. rv = iv_cur.
    ENDCASE.
  ENDMETHOD.


  METHOD build_items.
    DATA: lt_mtart TYPE RANGE OF mara-mtart, lt_matkl TYPE RANGE OF mara-matkl, lt_matnr TYPE RANGE OF mara-matnr,
          lt_mat   TYPE STANDARD TABLE OF ty_mat,  ls_mat TYPE ty_mat,
          lt_hrk   TYPE STANDARD TABLE OF hrkft,   lv_hrk TYPE hrkft,
          lt_zb    TYPE STANDARD TABLE OF ty_zb,   ls_zb  TYPE ty_zb,
          lt_txk   TYPE STANDARD TABLE OF ty_txt,  lt_txt TYPE STANDARD TABLE OF ty_txt, ls_t TYPE ty_txt,
          lt_cm    TYPE STANDARD TABLE OF ty_txt,
          lt_src   TYPE STANDARD TABLE OF ty_src,  ls_src TYPE ty_src,
          lt_comp  TYPE STANDARD TABLE OF ty_comp, ls_c TYPE ty_comp,
          lt_zbud  TYPE STANDARD TABLE OF ty_zbud, ls_z TYPE ty_zbud, ls_z2 TYPE ty_zbud,
          lt_stb   TYPE STANDARD TABLE OF stpox,   ls_stb TYPE stpox,
          lt_cat   TYPE STANDARD TABLE OF cscmat,
          lt_alt   TYPE STANDARD TABLE OF stlal,   lv_alt TYPE stlal,
          lt_prio  TYPE STANDARD TABLE OF string,  lv_p TYPE string,
          lt_frt   TYPE STANDARD TABLE OF ty_frt,  ls_f TYPE ty_frt,
          ls_h     TYPE ty_it, ls_i TYPE ty_it,
          lt_ci    TYPE STANDARD TABLE OF ty_it,
          ls_tag   TYPE ty_tag, lv_werks TYPE werks_d,
          lv_idx   TYPE i, lv_idx2 TYPE i, lv_flags TYPE string, lv_slot TYPE i, lv_rate TYPE ty_val,
          lv_from  TYPE d, lv_to TYPE d.
    FIELD-SYMBOLS <m> TYPE ty_mat.

    ls_tag = tag_get( is_s-origin_grp_sel ).
    lv_werks = is_s-plant_sel.
    IF lv_werks IS INITIAL. lv_werks = c_werks. ENDIF.

    to_range( EXPORTING iv_list = is_s-mtart_sel CHANGING ct_rng = lt_mtart ).
    DELETE lt_mtart WHERE low <> 'PKGN' AND low <> 'VERP'.
    IF lt_mtart IS INITIAL.
      lt_mtart = VALUE #( sign = 'I' option = 'EQ' ( low = 'PKGN' ) ( low = 'VERP' ) ).
    ENDIF.
    to_range( EXPORTING iv_list = ls_tag-matkl CHANGING ct_rng = lt_matkl ).
    to_range( EXPORTING iv_list = is_s-matnr_sel iv_mat = abap_true CHANGING ct_rng = lt_matnr ).

    " 1. packing materials of the plant, with origin group (MBEW-HRKFT)
    SELECT m~matnr, m~mtart, m~matkl, m~meins, c~werks, b~hrkft
      FROM mara AS m INNER JOIN marc AS c ON c~matnr = m~matnr
                     LEFT OUTER JOIN mbew AS b ON b~matnr = m~matnr AND b~bwkey = c~werks
      WHERE c~werks = @lv_werks AND c~lvorm = @space AND m~lvorm = @space
        AND m~mtart IN @lt_mtart AND m~matkl IN @lt_matkl AND m~matnr IN @lt_matnr
      INTO CORRESPONDING FIELDS OF TABLE @lt_mat.
    IF lt_mat IS INITIAL. RETURN. ENDIF.
    SORT lt_mat BY matnr.
    DELETE ADJACENT DUPLICATES FROM lt_mat COMPARING matnr.

    " 2. basic rate: ZMM_MAT_RATE, priority INFOREC > CONSUMP > MBEW (plant level)
    lv_from = is_s-key_date.
    SELECT material AS matnr, recordsource AS rate_src, plant, rate, currency AS curr,
           pricingunit AS peinh, conditionunit AS uom, validfrom AS valid_from, validto AS valid_to,
           purchasedocument AS doc, purchasedocumentitem AS item
      FROM zmm_mat_rate( p_cutoff_date = @lv_from )
      FOR ALL ENTRIES IN @lt_mat
      WHERE material = @lt_mat-matnr
        AND plant    = @lt_mat-werks
      INTO CORRESPONDING FIELDS OF TABLE @lt_src.
    DELETE lt_src WHERE valid_to < is_s-valid_from.
    SORT lt_src BY matnr rate_src valid_from DESCENDING doc DESCENDING item DESCENDING.
    ls_tag-prio = COND #( WHEN ls_tag-prio IS INITIAL THEN c_prio ELSE ls_tag-prio ).
    SPLIT ls_tag-prio AT ',' INTO TABLE lt_prio.

    " 3. ZBUD material per origin group (MARA-MTART = ZBUD, same MBEW-HRKFT)
    LOOP AT lt_mat ASSIGNING <m>.
      IF <m>-hrkft IS NOT INITIAL. APPEND <m>-hrkft TO lt_hrk. ENDIF.
    ENDLOOP.
    SORT lt_hrk. DELETE ADJACENT DUPLICATES FROM lt_hrk.
    IF lt_hrk IS NOT INITIAL.
      SELECT b~hrkft m~matnr INTO TABLE lt_zb
        FROM mara AS m INNER JOIN mbew AS b ON b~matnr = m~matnr AND b~bwkey = c_werks
        FOR ALL ENTRIES IN lt_hrk
        WHERE m~mtart = 'ZBUD' AND m~lvorm = space AND b~hrkft = lt_hrk-table_line.
      SORT lt_zb BY hrkft matnr. DELETE ADJACENT DUPLICATES FROM lt_zb COMPARING hrkft.
    ENDIF.

    " 4. single level BOM of each ZBUD material: latest active alternative, p(i) at base 100
    LOOP AT lt_zb INTO ls_zb.
      CLEAR: lt_stb, lt_cat, lt_alt, lv_alt.
      SELECT a~stlal INTO TABLE lt_alt
        FROM mast AS a INNER JOIN stko AS k ON k~stlnr = a~stlnr AND k~stlal = a~stlal
        WHERE a~matnr = ls_zb-matnr AND a~werks = c_werks AND a~stlan = 'B'
          AND k~lkenz = space AND k~datuv <= is_s-key_date.
      IF lt_alt IS INITIAL. CONTINUE. ENDIF.
      SORT lt_alt DESCENDING.
      READ TABLE lt_alt INTO lv_alt INDEX 1.
      CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
        EXPORTING
          capid  = 'PP01'
          datuv  = is_s-key_date
          emeng  = 100
          mehrs  = space
          mtnrv  = ls_zb-matnr
          stlan  = 'B'
          stlal  = lv_alt
          werks  = c_werks
        TABLES
          stb    = lt_stb
          matcat = lt_cat
        EXCEPTIONS
          OTHERS = 1.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      LOOP AT lt_stb INTO ls_stb WHERE idnrk IS NOT INITIAL.
        CLEAR ls_c.
        ls_c-hrkft = ls_zb-hrkft. ls_c-idnrk = ls_stb-idnrk. ls_c-meins = ls_stb-meins.
        ls_c-pct = ls_stb-menge.         "BOM item quantity is the % share (BOM base 1, items sum to 100) ls_c-stlal = lv_alt. ls_c-zbud = ls_zb-matnr.
        COLLECT ls_c INTO lt_comp.
      ENDLOOP.
    ENDLOOP.
    SORT lt_comp BY hrkft idnrk.

    " 5. ZBUD factor on the key date (A049 + KONP). KBETR of a % condition is stored x10 -> /10
    LOOP AT lt_comp INTO ls_c.
      ls_t-matnr = ls_c-idnrk. APPEND ls_t TO lt_cm.
    ENDLOOP.
    SORT lt_cm BY matnr. DELETE ADJACENT DUPLICATES FROM lt_cm COMPARING matnr.
    IF lt_cm IS NOT INITIAL.
      SELECT a~matnr a~datab a~datbi k~kbetr INTO TABLE lt_zbud
        FROM a049 AS a INNER JOIN konp AS k ON k~knumh = a~knumh
        FOR ALL ENTRIES IN lt_cm
        WHERE a~kappl = 'M' AND a~kschl = 'ZBUD' AND a~ekorg = c_ekorg AND a~esokz = '0'
          AND a~matnr = lt_cm-matnr AND a~datab <= is_s-key_date AND a~datbi >= is_s-key_date
          AND k~kschl = 'ZBUD' AND k~loevm_ko = space.
      SORT lt_zbud BY matnr datab DESCENDING.
    ENDIF.

    " 6. descriptions
    lt_txk = lt_cm.
    LOOP AT lt_mat ASSIGNING <m>.
      ls_t-matnr = <m>-matnr. APPEND ls_t TO lt_txk.
    ENDLOOP.
    SORT lt_txk BY matnr. DELETE ADJACENT DUPLICATES FROM lt_txk COMPARING matnr.
    SELECT matnr maktx INTO TABLE lt_txt FROM makt FOR ALL ENTRIES IN lt_txk
      WHERE matnr = lt_txk-matnr AND spras = sy-langu.
    SORT lt_txt BY matnr.

    " 7. freight, material + plant only (latest rate per condition type, window = 12 months to key date)
    lv_to = is_s-key_date. lv_from = lv_to - 365.
    SELECT matnr, werks, condtype, podate, currency, actamt, actqty
      FROM zi_bud_freight_latest( p_date_from = @lv_from, p_date_to = @lv_to )
      FOR ALL ENTRIES IN @lt_mat
      WHERE matnr = @lt_mat-matnr AND werks = @lt_mat-werks
      INTO CORRESPONDING FIELDS OF TABLE @lt_frt.
    DELETE lt_frt WHERE actqty = 0.
    SORT lt_frt BY matnr condtype podate DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt_frt COMPARING matnr condtype.

    " 8. assemble header + component rows
    LOOP AT lt_mat INTO ls_mat.
      CLEAR: ls_h, lt_ci, lv_flags, lv_slot.
      ls_h-matnr = ls_mat-matnr. ls_h-mtart = ls_mat-mtart. ls_h-matkl = ls_mat-matkl.
      ls_h-meins = ls_mat-meins. ls_h-werks = ls_mat-werks. ls_h-origin_grp = ls_mat-hrkft.
      ls_h-group_curr = c_group_curr.
      READ TABLE lt_txt INTO ls_t WITH KEY matnr = ls_mat-matnr BINARY SEARCH.
      IF sy-subrc = 0. ls_h-maktx = ls_t-maktx. ENDIF.

      LOOP AT lt_prio INTO lv_p.
        CONDENSE lv_p. TRANSLATE lv_p TO UPPER CASE.
        LOOP AT lt_src INTO ls_src WHERE matnr = ls_mat-matnr AND rate_src = lv_p AND rate > 0.
          ls_h-basic_rate_sap = ls_src-rate. ls_h-waers = ls_src-curr. ls_h-peinh = ls_src-peinh.
          ls_h-rate_src = ls_src-rate_src.
          IF ls_src-uom IS NOT INITIAL. ls_h-meins = ls_src-uom. ENDIF.
          EXIT.
        ENDLOOP.
        IF ls_h-rate_src IS NOT INITIAL. EXIT. ENDIF.
      ENDLOOP.
      IF ls_h-peinh = 0. ls_h-peinh = 1. ENDIF.
      ls_h-basic_rate_used = ls_h-basic_rate_sap.

      " freight slots
      LOOP AT lt_frt INTO ls_f WHERE matnr = ls_mat-matnr AND werks = ls_mat-werks.
        lv_rate = ls_f-actamt / ls_f-actqty * fx_factor( iv_waers = ls_f-currency iv_date = is_s-key_date ).
        lv_slot = lv_slot + 1.
        CASE lv_slot.
          WHEN 1. ls_h-frt_cond1 = ls_f-condtype. ls_h-frt_rate1 = lv_rate.
          WHEN 2. ls_h-frt_cond2 = ls_f-condtype. ls_h-frt_rate2 = lv_rate.
          WHEN 3. ls_h-frt_cond3 = ls_f-condtype. ls_h-frt_rate3 = lv_rate.
          WHEN 4. ls_h-frt_cond4 = ls_f-condtype. ls_h-frt_rate4 = lv_rate.
        ENDCASE.
        ls_h-frt_total = ls_h-frt_total + lv_rate.
        IF lv_slot >= 4. EXIT. ENDIF.
      ENDLOOP.
      ls_h-frt_curr = c_group_curr.
      IF lv_slot = 0. lv_flags = 'NOFRT'. ENDIF.

      READ TABLE lt_zb INTO ls_zb WITH KEY hrkft = ls_mat-hrkft BINARY SEARCH.
      IF sy-subrc = 0. ls_h-zbud_matnr = ls_zb-matnr. ENDIF.
      READ TABLE lt_comp TRANSPORTING NO FIELDS WITH KEY hrkft = ls_mat-hrkft BINARY SEARCH.
      IF sy-subrc <> 0 OR ls_mat-hrkft IS INITIAL.
        lv_flags = |{ lv_flags } NOBOM|.
      ELSE.
        lv_idx = sy-tabix.
        LOOP AT lt_comp INTO ls_c FROM lv_idx.
          IF ls_c-hrkft <> ls_mat-hrkft. EXIT. ENDIF.
          ls_h-alt_bom_used = ls_c-stlal.
          CLEAR ls_i.
          ls_i-matnr = ls_mat-matnr. ls_i-idnrk = ls_c-idnrk. ls_i-werks = ls_mat-werks.
          ls_i-mtart = ls_mat-mtart. ls_i-matkl = ls_mat-matkl. ls_i-meins = ls_c-meins.
          ls_i-waers = ls_h-waers.
          ls_i-pct_sap = ls_c-pct.
          READ TABLE lt_txt INTO ls_t WITH KEY matnr = ls_c-idnrk BINARY SEARCH.
          IF sy-subrc = 0. ls_i-maktx = ls_t-maktx. ENDIF.
          READ TABLE lt_zbud INTO ls_z WITH KEY matnr = ls_c-idnrk BINARY SEARCH.
          IF sy-subrc = 0.
            ls_i-zbud_sap = ls_z-kbetr / 10.
            lv_idx2 = sy-tabix + 1.
            READ TABLE lt_zbud INTO ls_z2 INDEX lv_idx2.
            IF sy-subrc = 0 AND ls_z2-matnr = ls_z-matnr.
              ls_i-flags = 'DUP'.
              IF lv_flags NS 'DUP'. lv_flags = |{ lv_flags } DUP|. ENDIF.
            ENDIF.
          ELSE.
            ls_i-flags = 'NOZBUD'.
            IF lv_flags NS 'NOZBUD'. lv_flags = |{ lv_flags } NOZBUD|. ENDIF.
          ENDIF.
          ls_i-zbud_used = ls_i-zbud_sap.
          APPEND ls_i TO lt_ci.
        ENDLOOP.
      ENDIF.
      CONDENSE lv_flags.
      ls_h-flags = lv_flags.
      INSERT ls_h INTO TABLE et_it.
      LOOP AT lt_ci INTO ls_i.
        INSERT ls_i INTO TABLE et_it.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD calc_one.
    DATA: lv_sum TYPE ty_val, lv_eff TYPE ty_val.
    FIELD-SYMBOLS <p> TYPE ty_pf.
    CLEAR: ev_br, ev_sum.
    LOOP AT ct_pf ASSIGNING <p>. ev_sum = ev_sum + <p>-pct. ENDLOOP.
    LOOP AT ct_pf ASSIGNING <p>.
      lv_eff = <p>-pct.
      IF iv_norm = 'X' AND ev_sum > 0. lv_eff = <p>-pct * 100 / ev_sum. ENDIF.
      <p>-cbr  = iv_rate * lv_eff / 100.
      <p>-cbud = <p>-cbr * ( 1 + <p>-f / 100 ).
      lv_sum = lv_sum + <p>-cbud.
    ENDLOOP.
    ev_br = round( val = lv_sum dec = iv_dec ).                    "round only the final rate
  ENDMETHOD.


  METHOD calculate.
    DATA: lt_it  TYPE tt_it, lt_ovr TYPE STANDARD TABLE OF zpkg_bud_ovr, ls_o TYPE zpkg_bud_ovr,
          lt_pf  TYPE tt_pf, ls_pf TYPE ty_pf, lt_ps TYPE tt_pf,
          lv_br  TYPE ty_val, lv_brs TYPE ty_val, lv_sum TYPE ty_val, lv_sums TYPE ty_val,
          lv_dec TYPE i, lv_n TYPE i, lv_f TYPE string, lv_fs TYPE string, lv_fx TYPE ty_val,
          lv_lvl TYPE c LENGTH 1.
    FIELD-SYMBOLS: <i> TYPE ty_it, <h> TYPE ty_it, <c> TYPE ty_it.
    CONSTANTS lc_tol TYPE p LENGTH 8 DECIMALS 4 VALUE '0.001'.

    SELECT SINGLE * FROM zpkg_bud_scen INTO ms_s WHERE scen_id = iv_id.
    items_load( EXPORTING iv_id = iv_id IMPORTING et_it = lt_it ).
    SELECT * FROM zpkg_bud_ovr INTO TABLE lt_ovr WHERE scen_id = iv_id.
    SORT lt_ovr BY seq.

    " reset to SAP, then replay overrides in order (direct key access)
    LOOP AT lt_it ASSIGNING <i>.
      <i>-basic_rate_used = <i>-basic_rate_sap.
      <i>-zbud_used       = <i>-zbud_sap.
    ENDLOOP.
    LOOP AT lt_ovr INTO ls_o.
      lv_lvl = ls_o-zlevel.
      READ TABLE lt_it ASSIGNING <i> WITH TABLE KEY matnr = ls_o-matnr werks = ls_o-werks idnrk = ls_o-component_matnr.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      CASE lv_lvl.
        WHEN 'R'. <i>-basic_rate_used = apply_rule( iv_rule = ls_o-zrule iv_cur = <i>-basic_rate_used iv_val = ls_o-new_value ).
        WHEN 'F'. <i>-zbud_used       = apply_rule( iv_rule = ls_o-zrule iv_cur = <i>-zbud_used iv_val = ls_o-new_value ).
      ENDCASE.
    ENDLOOP.

    " derive per material
    LOOP AT lt_it ASSIGNING <h> WHERE idnrk IS INITIAL.
      CLEAR: lt_pf, lt_ps.
      LOOP AT lt_it ASSIGNING <c> WHERE matnr = <h>-matnr AND werks = <h>-werks AND idnrk IS NOT INITIAL.
        ls_pf-pct = <c>-pct_sap. ls_pf-f = <c>-zbud_used. APPEND ls_pf TO lt_pf.
        ls_pf-pct = <c>-pct_sap. ls_pf-f = <c>-zbud_sap.  APPEND ls_pf TO lt_ps.
      ENDLOOP.
      lv_dec = curr_dec( <h>-waers ).
      calc_one( EXPORTING iv_rate = <h>-basic_rate_used iv_norm = ms_s-normalize_pct iv_dec = lv_dec
                IMPORTING ev_br = lv_br ev_sum = lv_sum CHANGING ct_pf = lt_pf ).
      calc_one( EXPORTING iv_rate = <h>-basic_rate_sap iv_norm = ms_s-normalize_pct iv_dec = lv_dec
                IMPORTING ev_br = lv_brs ev_sum = lv_sums CHANGING ct_pf = lt_ps ).

      " flags: keep the build-time ones, recompute PCT100 / NORATE
      lv_f = <h>-flags. lv_fs = <h>-flags.
      REPLACE ALL OCCURRENCES OF 'PCT100' IN lv_f WITH ''.
      REPLACE ALL OCCURRENCES OF 'NORATE' IN lv_f WITH ''.
      REPLACE ALL OCCURRENCES OF 'PCT100' IN lv_fs WITH ''.
      REPLACE ALL OCCURRENCES OF 'NORATE' IN lv_fs WITH ''.
      IF lv_f NS 'NOBOM'.
        IF lv_sum = 0 OR ( ms_s-normalize_pct IS INITIAL AND abs( lv_sum - 100 ) > lc_tol ).
          lv_f = |{ lv_f } PCT100|.
        ENDIF.
        IF lv_sums = 0 OR ( ms_s-normalize_pct IS INITIAL AND abs( lv_sums - 100 ) > lc_tol ).
          lv_fs = |{ lv_fs } PCT100|.
        ENDIF.
      ENDIF.
      IF <h>-basic_rate_used <= 0. lv_f  = |{ lv_f } NORATE|.  ENDIF.
      IF <h>-basic_rate_sap  <= 0. lv_fs = |{ lv_fs } NORATE|. ENDIF.
      CONDENSE: lv_f, lv_fs.
      <h>-flags = lv_f.

      IF lv_f CS 'NOBOM' OR lv_f CS 'PCT100' OR lv_f CS 'NORATE'.
        <h>-budget_rate = 0. <h>-variance = 0. <h>-variance_pct = 0.
      ELSE.
        <h>-budget_rate  = lv_br.
        <h>-variance     = lv_br - <h>-basic_rate_used.
        <h>-variance_pct = <h>-variance / <h>-basic_rate_used * 100.
      ENDIF.
      IF lv_fs CS 'NOBOM' OR lv_fs CS 'PCT100' OR lv_fs CS 'NORATE'.
        <h>-budget_rate_sap = 0.
      ELSE.
        <h>-budget_rate_sap = lv_brs.
      ENDIF.

      " group currency value and landed rate (freight is per base unit, BR per price unit)
      lv_fx = fx_factor( iv_waers = <h>-waers iv_date = ms_s-key_date ).
      <h>-group_curr  = c_group_curr.
      <h>-group_value = <h>-budget_rate * lv_fx.
      <h>-landed_curr = c_group_curr.
      IF <h>-budget_rate > 0.
        <h>-landed_rate = <h>-group_value + <h>-frt_total * <h>-peinh.
      ELSE.
        <h>-landed_rate = 0.                                          "blocked row: no landed rate
      ENDIF.

      lv_n = 0.
      LOOP AT lt_it ASSIGNING <c> WHERE matnr = <h>-matnr AND werks = <h>-werks AND idnrk IS NOT INITIAL.
        lv_n = lv_n + 1.
        READ TABLE lt_pf INTO ls_pf INDEX lv_n.
        <c>-comp_base_rate = ls_pf-cbr.
        <c>-comp_bud_rate  = ls_pf-cbud.
        <c>-basic_rate_used = <h>-basic_rate_used.
      ENDLOOP.
    ENDLOOP.

    items_save( iv_id = iv_id it_it = lt_it ).
    set_status( iv_id = iv_id iv_status = 'C' ).
  ENDMETHOD.


  METHOD create.
    DATA: ls_s TYPE zpkg_bud_scen, lt_it TYPE tt_it, lv_n TYPE i, ls_tag TYPE ty_tag.
    FIELD-SYMBOLS <i> TYPE ty_it.
    IF ms_act-valid_from IS INITIAL OR ms_act-valid_to IS INITIAL OR ms_act-valid_to < ms_act-valid_from.
      err( 'Enter a valid validity period (from <= to)' ).
    ENDIF.
    ls_s-scen_id    = next_id( ).
    ls_s-descr      = ms_act-descr.
    ls_s-plant_sel  = ms_act-werks.
    ls_s-status     = 'D'.
    ls_s-valid_from = ms_act-valid_from.
    ls_s-valid_to   = ms_act-valid_to.
    ls_s-key_date   = ms_act-key_date.
    IF ls_s-key_date IS INITIAL. ls_s-key_date = ms_act-valid_from. ENDIF.
    ls_s-gjahr      = fy( ms_act-valid_from ).
    ls_s-version    = ms_act-budget_version.
    IF ls_s-version IS INITIAL.
      ls_s-version = next_ver( iv_from = ls_s-valid_from iv_to = ls_s-valid_to ).
    ENDIF.
    ls_s-normalize_pct = ms_act-norm.
    ls_s-mtart_sel     = ms_act-mtart_sel.
    ls_s-matnr_sel     = ms_act-matnr_sel.
    ls_tag-matkl = ms_act-matkl_sel.
    ls_tag-prio  = ms_act-prio.
    TRANSLATE ls_tag-prio TO UPPER CASE.
    IF ls_tag-prio IS INITIAL. ls_tag-prio = c_prio. ENDIF.
    ls_s-origin_grp_sel = tag_put( ls_tag ).
    ls_s-created_by = mv_email. ls_s-created_on = sy-datum. ls_s-created_tm = sy-uzeit.

    build_items( EXPORTING is_s = ls_s IMPORTING et_it = lt_it ).
    IF lt_it IS INITIAL.
      err( 'No packing materials found for the selection' ).
    ENDIF.
    INSERT zpkg_bud_scen FROM ls_s.
    items_save( iv_id = ls_s-scen_id it_it = lt_it ).
    calculate( ls_s-scen_id ).

    LOOP AT lt_it ASSIGNING <i> WHERE idnrk IS INITIAL.
      lv_n = lv_n + 1.
    ENDLOOP.
    log( iv_id = ls_s-scen_id iv_event = 'CREATE' iv_text = |{ lv_n } materials, version { ls_s-version }| ).
    ms_act-scen_id = ls_s-scen_id.
    ms_act-msg = |Scenario { ls_s-scen_id } created (version { ls_s-version }, { lv_n } materials)|.
  ENDMETHOD.


  METHOD add_ovr.
    DATA: ls_o TYPE zpkg_bud_ovr, lv_seq TYPE i.
    SELECT MAX( seq ) FROM zpkg_bud_ovr INTO lv_seq WHERE scen_id = ms_s-scen_id.
    ls_o-scen_id = ms_s-scen_id. ls_o-seq = lv_seq + 1.
    ls_o-matnr = iv_matnr. ls_o-werks = is_it-werks. ls_o-component_matnr = iv_idnrk.
    ls_o-zlevel = iv_level. ls_o-scope = iv_scope.
    CASE iv_rule.
      WHEN 'S'. ls_o-zrule = 'SET'.
      WHEN 'P'. ls_o-zrule = 'PCT'.
      WHEN 'A'. ls_o-zrule = 'ABS'.
    ENDCASE.
    IF iv_level = 'R'.
      ls_o-old_value = is_it-basic_rate_used.
    ELSE.
      ls_o-old_value = is_it-zbud_used.
    ENDIF.
    ls_o-new_value = iv_val. ls_o-ovr_by = mv_email. ls_o-ovr_date = sy-datum. ls_o-ovr_time = sy-uzeit.
    INSERT zpkg_bud_ovr FROM ls_o.
  ENDMETHOD.


  METHOD targets.
    "rows of the scenario that an edit / revert scope refers to (header rows for R, component rows for F)
    DATA: lt_m TYPE STANDARD TABLE OF string, lv_m TYPE string, lt_r TYPE RANGE OF matnr, ls_r LIKE LINE OF lt_r.
    FIELD-SYMBOLS: <i> TYPE ty_it, <t> TYPE ty_it.
    SPLIT iv_matnr AT ',' INTO TABLE lt_m.
    LOOP AT lt_m INTO lv_m.
      CONDENSE lv_m. TRANSLATE lv_m TO UPPER CASE.
      IF lv_m IS INITIAL. CONTINUE. ENDIF.
      ls_r-sign = 'I'. ls_r-option = 'EQ'. ls_r-low = mat_in( lv_m ). APPEND ls_r TO lt_r.
    ENDLOOP.
    LOOP AT it_it ASSIGNING <i>.
      IF lt_r IS NOT INITIAL AND <i>-matnr NOT IN lt_r. CONTINUE. ENDIF.
      IF iv_matkl IS NOT INITIAL AND <i>-matkl <> iv_matkl. CONTINUE. ENDIF.
      IF iv_idnrk IS NOT INITIAL AND <i>-idnrk <> iv_idnrk. CONTINUE. ENDIF.
      APPEND INITIAL LINE TO et_mat ASSIGNING <t>.
      <t> = <i>.
    ENDLOOP.
  ENDMETHOD.


  METHOD edit.
    DATA: lt_it TYPE tt_it, lt_t TYPE STANDARD TABLE OF ty_it, lv_n TYPE i, lv_lvl TYPE c LENGTH 1, lv_sc TYPE c LENGTH 1,
          lv_lv TYPE c LENGTH 1, lv_idnrk TYPE matnr.
    FIELD-SYMBOLS <t> TYPE ty_it.
    load_scen( ). chk_status( 'DC' ).
    IF ms_act-ovr_level = 'P'.
      err( 'BOM percentage can not be overridden (only rate or ZBUD factor)' ).
    ENDIF.
    IF ms_act-ovr_level IS INITIAL OR 'RZ' NS ms_act-ovr_level.
      err( 'Level must be R (basic rate) or Z (ZBUD factor)' ).
    ENDIF.
    IF ms_act-ovr_rule IS INITIAL OR 'SPA' NS ms_act-ovr_rule.
      err( 'Rule must be S (set), P (percent) or A (absolute)' ).
    ENDIF.
    lv_lvl = ms_act-ovr_level.
    IF lv_lvl = 'Z'. lv_lv = 'F'. ELSE. lv_lv = 'R'. ENDIF.
    lv_idnrk = ms_act-scope_idnrk.
    items_load( EXPORTING iv_id = ms_s-scen_id IMPORTING et_it = lt_it ).
    targets( EXPORTING it_it = lt_it iv_matnr = ms_act-scope_matnr iv_matkl = ms_act-scope_matkl iv_idnrk = lv_idnrk
             IMPORTING et_mat = lt_t ).
    IF ms_act-scope_idnrk IS NOT INITIAL OR ms_act-scope_matnr CS ','.
      lv_sc = 'G'.
    ELSE.
      lv_sc = 'M'.
    ENDIF.
    IF ms_act-scope_matnr IS INITIAL AND ms_act-scope_matkl IS INITIAL AND ms_act-scope_idnrk IS INITIAL.
      lv_sc = 'G'.
    ENDIF.
    LOOP AT lt_t ASSIGNING <t>.
      IF lv_lv = 'R' AND <t>-idnrk IS NOT INITIAL. CONTINUE. ENDIF.      "rate sits on the header row
      IF lv_lv = 'F' AND <t>-idnrk IS INITIAL.     CONTINUE. ENDIF.      "factor sits on the component row
      add_ovr( iv_level = lv_lv iv_matnr = <t>-matnr iv_idnrk = <t>-idnrk iv_scope = lv_sc
               iv_rule = ms_act-ovr_rule iv_val = ms_act-new_value is_it = <t> ).
      lv_n = lv_n + 1.
    ENDLOOP.
    IF lv_n = 0. err( 'No row matches the selected scope' ). ENDIF.
    set_status( iv_id = ms_s-scen_id iv_status = 'D' ).
    log( iv_id = ms_s-scen_id iv_event = 'OVERRIDE'
         iv_text = |{ ms_act-ovr_level }/{ ms_act-ovr_rule } { ms_act-new_value } on { lv_n } row(s)| ).
    ms_act-msg = |{ lv_n } override(s) saved - recalculate to apply|.
  ENDMETHOD.


  METHOD revert.
    DATA: lt_it TYPE tt_it, lt_t TYPE STANDARD TABLE OF ty_it, lv_lv TYPE c LENGTH 1, lv_idnrk TYPE matnr.
    FIELD-SYMBOLS <t> TYPE ty_it.
    load_scen( ). chk_status( 'DC' ).
    IF ms_act-scope_matnr IS INITIAL AND ms_act-scope_matkl IS INITIAL
       AND ms_act-scope_idnrk IS INITIAL AND ms_act-ovr_level IS INITIAL.
      DELETE FROM zpkg_bud_ovr WHERE scen_id = ms_s-scen_id.
      ms_act-msg = 'All overrides removed - recalculate'.
    ELSE.
      lv_idnrk = ms_act-scope_idnrk.
      items_load( EXPORTING iv_id = ms_s-scen_id IMPORTING et_it = lt_it ).
      targets( EXPORTING it_it = lt_it iv_matnr = ms_act-scope_matnr iv_matkl = ms_act-scope_matkl iv_idnrk = lv_idnrk
               IMPORTING et_mat = lt_t ).
      LOOP AT lt_t ASSIGNING <t>.
        IF ms_act-ovr_level IS INITIAL OR ms_act-ovr_level = 'R'.
          IF <t>-idnrk IS INITIAL.
            DELETE FROM zpkg_bud_ovr WHERE scen_id = ms_s-scen_id AND matnr = <t>-matnr AND werks = <t>-werks
                   AND component_matnr = space AND zlevel = 'R'.
          ENDIF.
        ENDIF.
        IF ms_act-ovr_level IS INITIAL OR ms_act-ovr_level = 'Z'.
          IF <t>-idnrk IS NOT INITIAL.
            DELETE FROM zpkg_bud_ovr WHERE scen_id = ms_s-scen_id AND matnr = <t>-matnr AND werks = <t>-werks
                   AND component_matnr = <t>-idnrk AND zlevel = 'F'.
          ENDIF.
        ENDIF.
      ENDLOOP.
      ms_act-msg = 'Reverted to SAP value - recalculate'.
    ENDIF.
    set_status( iv_id = ms_s-scen_id iv_status = 'D' ).
    log( iv_id = ms_s-scen_id iv_event = 'REVERT' iv_text = ms_act-msg ).
  ENDMETHOD.


  METHOD copy.
    DATA: ls_n TYPE zpkg_bud_scen, lt_i TYPE STANDARD TABLE OF zpkg_bud_item, lt_o TYPE STANDARD TABLE OF zpkg_bud_ovr,
          ls_tag TYPE ty_tag.
    FIELD-SYMBOLS: <i> TYPE zpkg_bud_item, <o> TYPE zpkg_bud_ovr.
    load_scen( ).
    SELECT * FROM zpkg_bud_item INTO TABLE lt_i WHERE scen_id = ms_s-scen_id.
    SELECT * FROM zpkg_bud_ovr  INTO TABLE lt_o WHERE scen_id = ms_s-scen_id.
    ls_n = ms_s.
    ls_n-scen_id = next_id( ).
    ls_tag = tag_get( ms_s-origin_grp_sel ).
    ls_tag-base = ms_s-scen_id.
    ls_n-origin_grp_sel = tag_put( ls_tag ).
    ls_n-status = 'D'.
    ls_n-descr = ms_act-descr.
    IF ls_n-descr IS INITIAL. ls_n-descr = |Copy of { ms_s-scen_id }|. ENDIF.
    ls_n-version = ms_act-budget_version.
    IF ls_n-version IS INITIAL.
      ls_n-version = next_ver( iv_from = ms_s-valid_from iv_to = ms_s-valid_to ).
    ENDIF.
    CLEAR: ls_n-final_by, ls_n-final_on, ls_n-final_tm, ls_n-changed_by, ls_n-changed_on, ls_n-changed_tm.
    ls_n-created_by = mv_email. ls_n-created_on = sy-datum. ls_n-created_tm = sy-uzeit.
    LOOP AT lt_i ASSIGNING <i>. <i>-scen_id = ls_n-scen_id. CLEAR <i>-written_key. ENDLOOP.
    LOOP AT lt_o ASSIGNING <o>. <o>-scen_id = ls_n-scen_id. ENDLOOP.
    INSERT zpkg_bud_scen FROM ls_n.
    IF lt_i IS NOT INITIAL. INSERT zpkg_bud_item FROM TABLE lt_i. ENDIF.
    IF lt_o IS NOT INITIAL. INSERT zpkg_bud_ovr FROM TABLE lt_o. ENDIF.
    calculate( ls_n-scen_id ).
    log( iv_id = ls_n-scen_id iv_event = 'CREATE' iv_text = |Copy of { ms_s-scen_id } v{ ms_s-version }| ).
    ms_act-scen_id = ls_n-scen_id.
    ms_act-msg = |Scenario { ls_n-scen_id } created as copy (version { ls_n-version })|.
  ENDMETHOD.


  METHOD submit.
    load_scen( ). chk_status( 'C' ).
    set_status( iv_id = ms_s-scen_id iv_status = 'S' ).
    log( iv_id = ms_s-scen_id iv_event = 'SUBMIT' iv_text = 'Submitted' ).
    ms_act-msg = 'Scenario submitted'.
  ENDMETHOD.


  METHOD delete_scen.
    load_scen( ).
    IF ms_s-status = 'F'.
      err( 'Final scenarios cannot be deleted. Reopen first.' ).
    ENDIF.
    DELETE FROM zpkg_bud_item WHERE scen_id = ms_s-scen_id.
    DELETE FROM zpkg_bud_ovr  WHERE scen_id = ms_s-scen_id.
    DELETE FROM zpkg_bud_scen WHERE scen_id = ms_s-scen_id.
    log( iv_id = ms_s-scen_id iv_event = 'DELETE' iv_text = 'Scenario deleted' ).
    ms_act-msg = |Scenario { ms_s-scen_id } deleted|.
  ENDMETHOD.


  METHOD reopen.
    load_scen( ). chk_status( 'F' ).
    set_status( iv_id = ms_s-scen_id iv_status = 'C' ).
    log( iv_id = ms_s-scen_id iv_event = 'REOPEN' iv_text = 'Reopened' ).
    ms_act-msg = 'Scenario reopened. Rows already written to ZCOMPONENT(_N) are NOT reversed.'.
  ENDMETHOD.


  METHOD finalize.
    DATA: lt_it  TYPE tt_it, lt_h TYPE STANDARD TABLE OF ty_it, lt_old TYPE STANDARD TABLE OF zpkg_bud_scen,
          lt_om  TYPE STANDARD TABLE OF zpkg_bud_item, lt_mt TYPE STANDARD TABLE OF mtart,
          lt_wr  TYPE tt_it, lv_land TYPE land1, lv_tot TYPE i, lv_n1 TYPE i, lv_n2 TYPE i, lv_hit TYPE abap_bool,
          lt_fm  TYPE STANDARD TABLE OF mtart, lv_mt TYPE mtart.
    FIELD-SYMBOLS: <h> TYPE ty_it, <o> TYPE zpkg_bud_scen, <om> TYPE zpkg_bud_item.
    load_scen( ).
    IF ms_s-status = 'D'. err( 'Recalculate the scenario before finalising' ). ENDIF.
    chk_status( 'CS' ).

    items_load( EXPORTING iv_id = ms_s-scen_id IMPORTING et_it = lt_it ).
    LOOP AT lt_it ASSIGNING <h> WHERE idnrk IS INITIAL.
      APPEND <h> TO lt_h.
    ENDLOOP.
    lv_tot = lines( lt_h ).
    DELETE lt_h WHERE flags CS 'NOBOM' OR flags CS 'PCT100' OR flags CS 'NORATE'.
    IF lt_h IS INITIAL. err( 'No row without blocking exception - nothing to finalise' ). ENDIF.

    " only one Final per version / period / plant / material type
    SELECT scen_id INTO TABLE @DATA(lt_fin) FROM zpkg_bud_scen
      WHERE status = 'F' AND scen_id <> @ms_s-scen_id AND plant_sel = @ms_s-plant_sel
        AND version = @ms_s-version AND valid_from = @ms_s-valid_from AND valid_to = @ms_s-valid_to.
    LOOP AT lt_fin INTO DATA(ls_fin).
      SELECT * FROM zpkg_bud_item INTO TABLE lt_om WHERE scen_id = ls_fin-scen_id AND row_level = 'H'.
      LOOP AT lt_om ASSIGNING <om>.
        SELECT SINGLE mtart FROM mara INTO lv_mt WHERE matnr = <om>-matnr.
        APPEND lv_mt TO lt_mt.
      ENDLOOP.
    ENDLOOP.
    SORT lt_mt. DELETE ADJACENT DUPLICATES FROM lt_mt.
    LOOP AT lt_h ASSIGNING <h>.
      READ TABLE lt_mt TRANSPORTING NO FIELDS WITH KEY table_line = <h>-mtart.
      IF sy-subrc = 0.
        err( |Version { ms_s-version } is already final for material type { <h>-mtart } in this period| ).
      ENDIF.
    ENDLOOP.

    SELECT SINGLE land1 FROM t001w INTO lv_land WHERE werks = ms_s-plant_sel.
    IF sy-subrc <> 0. SELECT SINGLE land1 FROM t001w INTO lv_land WHERE werks = c_werks. ENDIF.
    LOOP AT lt_h ASSIGNING <h>.
      IF lv_land = 'IN'.
        write_in( <h> ).  lv_n1 = lv_n1 + 1.
      ELSE.
        write_n( is_h = <h> iv_land = lv_land ). lv_n2 = lv_n2 + 1.
      ENDIF.
      UPDATE zpkg_bud_item SET written_key = 'X'
        WHERE scen_id = ms_s-scen_id AND matnr = <h>-matnr AND werks = <h>-werks AND component_matnr = space.
    ENDLOOP.

    " earlier final versions, same period, any shared material => Superseded
    SELECT * FROM zpkg_bud_scen INTO TABLE lt_old
      WHERE status = 'F' AND plant_sel = ms_s-plant_sel AND valid_from = ms_s-valid_from
        AND valid_to = ms_s-valid_to AND version < ms_s-version.
    LOOP AT lt_old ASSIGNING <o>.
      CLEAR lv_hit.
      SELECT * FROM zpkg_bud_item INTO TABLE lt_om WHERE scen_id = <o>-scen_id AND row_level = 'H'.
      SORT lt_om BY matnr.
      LOOP AT lt_h ASSIGNING <h>.
        READ TABLE lt_om TRANSPORTING NO FIELDS WITH KEY matnr = <h>-matnr BINARY SEARCH.
        IF sy-subrc = 0. lv_hit = abap_true. EXIT. ENDIF.
      ENDLOOP.
      IF lv_hit = abap_true.
        set_status( iv_id = <o>-scen_id iv_status = 'X' ).
        log( iv_id = <o>-scen_id iv_event = 'FINAL' iv_text = |Superseded by { ms_s-scen_id }| ).
      ENDIF.
    ENDLOOP.

    UPDATE zpkg_bud_scen SET status = 'F' final_by = mv_email final_on = sy-datum final_tm = sy-uzeit
           changed_by = mv_email changed_on = sy-datum changed_tm = sy-uzeit
           WHERE scen_id = ms_s-scen_id.
    ms_act-rows_zcomp = lv_n1. ms_act-rows_zcompn = lv_n2. ms_act-rows_skip = lv_tot - lines( lt_h ).
    log( iv_id = ms_s-scen_id iv_event = 'FINAL'
         iv_text = |ZCOMPONENT { lv_n1 }, ZCOMPONENT_N { lv_n2 }, skipped { ms_act-rows_skip }| ).
    ms_act-msg = |Final: { lv_n1 } row(s) to ZCOMPONENT, { lv_n2 } to ZCOMPONENT_N, { ms_act-rows_skip } skipped (exceptions)|.
    CLEAR: lt_wr, lt_fm.
  ENDMETHOD.


  METHOD write_in.
    DATA: ls TYPE zcomponent, lv_landed TYPE ty_val.
    lv_landed = is_h-budget_rate.
    IF is_h-landed_curr = is_h-waers AND is_h-landed_rate > 0. lv_landed = is_h-landed_rate. ENDIF.
    SELECT SINGLE * FROM zcomponent INTO ls
      WHERE matnr = is_h-matnr AND werks = is_h-werks AND gjahr = ms_s-gjahr AND valid_from = ms_s-valid_from.
    IF sy-subrc = 0.
      UPDATE zcomponent SET valid_to = ms_s-valid_to category = 'A' maktx = is_h-maktx
             meins = is_h-meins epein = is_h-peinh waers = is_h-waers
             basic = is_h-budget_rate total = is_h-budget_rate landed = lv_landed
             buduom = is_h-meins chgdate = sy-datum chgtime = sy-uzeit chguser = sy-uname
        WHERE matnr = is_h-matnr AND werks = is_h-werks AND gjahr = ms_s-gjahr AND valid_from = ms_s-valid_from.
    ELSE.
      CLEAR ls.
      ls-matnr = is_h-matnr. ls-werks = is_h-werks. ls-gjahr = ms_s-gjahr.
      ls-valid_from = ms_s-valid_from. ls-valid_to = ms_s-valid_to. ls-category = 'A'.
      ls-maktx = is_h-maktx. ls-meins = is_h-meins. ls-epein = is_h-peinh. ls-waers = is_h-waers.
      ls-basic = is_h-budget_rate. ls-total = is_h-budget_rate. ls-landed = lv_landed.
      ls-buduom = is_h-meins.
      ls-erdat = sy-datum. ls-ernam = sy-uname. ls-erzet = sy-uzeit.
      INSERT zcomponent FROM ls.
    ENDIF.
    IF sy-subrc <> 0. err( |Write to ZCOMPONENT failed for { is_h-matnr }| ). ENDIF.
  ENDMETHOD.


  METHOD write_n.
    DATA: ls TYPE zcomponent_n, lv_landed TYPE ty_val.
    lv_landed = is_h-budget_rate.
    IF is_h-landed_curr = is_h-waers AND is_h-landed_rate > 0. lv_landed = is_h-landed_rate. ENDIF.
    SELECT SINGLE * FROM zcomponent_n INTO ls
      WHERE matnr = is_h-matnr AND werks = is_h-werks AND gjahr = ms_s-gjahr
        AND valid_from = ms_s-valid_from AND valid_to = ms_s-valid_to AND land1 = iv_land AND ayu_cos = 'A'.
    IF sy-subrc = 0.
      UPDATE zcomponent_n SET category = 'A' maktx = is_h-maktx meins = is_h-meins epein = is_h-peinh
             waers = is_h-waers b_rate = is_h-budget_rate landed = lv_landed b_uom = is_h-meins
             erdat = sy-datum ernam = sy-uname ertim = sy-uzeit
        WHERE matnr = is_h-matnr AND werks = is_h-werks AND gjahr = ms_s-gjahr
          AND valid_from = ms_s-valid_from AND valid_to = ms_s-valid_to AND land1 = iv_land AND ayu_cos = 'A'.
    ELSE.
      CLEAR ls.
      ls-matnr = is_h-matnr. ls-werks = is_h-werks. ls-gjahr = ms_s-gjahr.
      ls-valid_from = ms_s-valid_from. ls-valid_to = ms_s-valid_to. ls-land1 = iv_land. ls-ayu_cos = 'A'.
      ls-category = 'A'. ls-maktx = is_h-maktx. ls-meins = is_h-meins. ls-epein = is_h-peinh.
      ls-waers = is_h-waers. ls-b_rate = is_h-budget_rate. ls-landed = lv_landed.
      ls-b_uom = is_h-meins.
      ls-erdat = sy-datum. ls-ernam = sy-uname. ls-ertim = sy-uzeit.
      INSERT zcomponent_n FROM ls.
    ENDIF.
    IF sy-subrc <> 0. err( |Write to ZCOMPONENT_N failed for { is_h-matnr }| ). ENDIF.
  ENDMETHOD.

ENDCLASS.
