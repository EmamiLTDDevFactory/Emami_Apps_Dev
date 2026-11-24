CLASS zcl_mm_cogm_act DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING io_util TYPE REF TO zcl_mm_bom_cost_util.

    "! actual COGM per material base unit: material ledger periodic unit price, or the upload table
    METHODS read
      IMPORTING it_keys       TYPE zif_mm_bom_cost_types=>ty_head_tab
      RETURNING VALUE(rt_act) TYPE zif_mm_cogm_types=>ty_t_act.

  PRIVATE SECTION.
    DATA: mo_util TYPE REF TO zcl_mm_bom_cost_util,
          mv_src  TYPE c LENGTH 5.                  " WAC (default) | ML | TABLE | NONE
ENDCLASS.



CLASS ZCL_MM_COGM_ACT IMPLEMENTATION.


  METHOD constructor.
    mo_util = io_util.
    mv_src  = mo_util->cfg( iv_key = 'ACT_SOURCE' iv_default = 'WAC' ).
  ENDMETHOD.


  METHOD read.
    CHECK it_keys IS NOT INITIAL AND mv_src <> 'NONE'.
    DATA(lv_now) = CONV i( sy-datum(4) * 100 + sy-datum+4(2) ).

    CASE mv_src.
      WHEN 'WAC'.
        " actual cost of the last 90 days of production (the same SAP actual as the Sales view and MIS: ZCL_MM_WAC_ACTUAL, RM + PM + perfume + conversion per produced piece)
        DATA: ls_wp TYPE zif_mm_wac_types=>ty_par, lt_wa TYPE zif_mm_wac_types=>ty_t_act, lt_wm TYPE string_table.
        ls_wp-date_to   = sy-datum.
        ls_wp-date_from = sy-datum - 90.
        ls_wp-werks = VALUE #( FOR k IN it_keys ( sign = 'I' option = 'EQ' low = k-werks ) ).
        ls_wp-matnr = VALUE #( FOR k IN it_keys ( sign = 'I' option = 'EQ' low = k-matnr ) ).
        SORT ls_wp-werks BY low. DELETE ADJACENT DUPLICATES FROM ls_wp-werks COMPARING low.
        SORT ls_wp-matnr BY low. DELETE ADJACENT DUPLICATES FROM ls_wp-matnr COMPARING low.
        NEW zcl_mm_wac_actual( mo_util )->read( EXPORTING is_par = ls_wp IMPORTING et_act = lt_wa et_msg = lt_wm ).
        SELECT matnr, meins FROM mara FOR ALL ENTRIES IN @it_keys WHERE matnr = @it_keys-matnr INTO TABLE @DATA(lt_mu).
        LOOP AT lt_wa INTO DATA(ls_wa) WHERE qty > 0.
          READ TABLE lt_mu INTO DATA(ls_mu) WITH KEY matnr = ls_wa-matnr.
          APPEND VALUE #( matnr = ls_wa-matnr werks = ls_wa-werks
                          curr  = mo_util->mv_group_curr
                          uom   = ls_mu-meins
                          cogm  = ( ls_wa-rm + ls_wa-pm + ls_wa-perf + ls_wa-conv ) / ls_wa-qty
                          period = 'last 90d'
                          ok    = abap_true ) TO rt_act.
        ENDLOOP.

      WHEN 'ML'.
        " periodic unit price of the latest period that has one (price determination in CKMLCR)
        SELECT h~matnr, h~bwkey AS werks, r~bdatj, r~poper, r~pvprs, r~peinh, a~meins
          FROM ckmlhd AS h
          INNER JOIN ckmlcr AS r ON r~kalnr = h~kalnr
          INNER JOIN mara   AS a ON a~matnr = h~matnr
          FOR ALL ENTRIES IN @it_keys
          WHERE h~matnr = @it_keys-matnr AND h~bwkey = @it_keys-werks AND h~bwtar = @space
            AND r~curtp = '10' AND r~pvprs > 0
          INTO TABLE @DATA(lt_ml).
        SORT lt_ml BY matnr werks bdatj DESCENDING poper DESCENDING.
        DELETE ADJACENT DUPLICATES FROM lt_ml COMPARING matnr werks.
        LOOP AT lt_ml INTO DATA(ls_ml).
          CHECK ls_ml-bdatj * 100 + ls_ml-poper <= lv_now.
          APPEND VALUE #( matnr = ls_ml-matnr werks = ls_ml-werks
                          curr  = mo_util->get_plant_local_currency( ls_ml-werks )
                          uom   = ls_ml-meins
                          cogm  = CONV decfloat34( ls_ml-pvprs ) / COND decfloat34( WHEN ls_ml-peinh > 0 THEN ls_ml-peinh ELSE 1 )
                          period = |{ ls_ml-bdatj }/{ ls_ml-poper+1(2) }|
                          ok    = abap_true ) TO rt_act.
        ENDLOOP.

      WHEN 'TABLE'.
        SELECT matnr, werks, gjahr, poper, cogm, uom, curr FROM zmm_cogm_act
          FOR ALL ENTRIES IN @it_keys
          WHERE matnr = @it_keys-matnr AND werks = @it_keys-werks
          INTO TABLE @DATA(lt_t).
        SORT lt_t BY matnr werks gjahr DESCENDING poper DESCENDING.
        DELETE ADJACENT DUPLICATES FROM lt_t COMPARING matnr werks.
        LOOP AT lt_t INTO DATA(ls_t).
          APPEND VALUE #( matnr = ls_t-matnr werks = ls_t-werks curr = ls_t-curr uom = ls_t-uom
                          cogm  = ls_t-cogm
                          period = |{ ls_t-gjahr }/{ ls_t-poper+1(2) }|
                          ok    = abap_true ) TO rt_act.
        ENDLOOP.
    ENDCASE.
  ENDMETHOD.
ENDCLASS.
